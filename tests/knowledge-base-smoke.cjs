const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(appScript, 'the page has an inline application script');

const csv = [
  'ID,Type,Category,Question/Title,AI draft answer,Answer,Status',
  '1,FAQ,Pricing,"What, when does it cost?","DRAFT PRICE","Approved price answer",Approved',
  '2,FAQ,Pricing,"Needs review","Unapproved draft","Do not show",Needs Review',
  '3,FAQ,Policies,"Blank status","Draft","Do not show",',
  '4,FAQ,Policies,"Draft only","Draft without approved answer",,Approved',
  '5,FAQ,"<img src=x>","<script>alert(1)</script>","Unsafe draft","<b>literal text</b>",Approved'
].join('\n');

function makePage({ search = '', businessConfigs, defaultSlug, csvBySlug }) {
  const calls = [];
  const nodes = new Map();
  const makeNode = () => ({
    textContent: '', value: '', disabled: false, hidden: false, innerHTML: '',
    classList: { toggle() {} }, addEventListener() {}
  });
  const document = {
    title: '',
    baseURI: 'https://example.test/yepmo/',
    documentElement: { style: { setProperty() {} } },
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, makeNode());
      return nodes.get(id);
    }
  };
  const fetch = async value => {
    const url = new URL(value, document.baseURI);
    calls.push(url.toString());
    if (url.pathname.endsWith('/businesses/default.json')) {
      return defaultSlug
        ? { ok: true, json: async () => ({ slug: defaultSlug }) }
        : { ok: false, json: async () => ({}) };
    }
    const configMatch = url.pathname.match(/\/businesses\/([a-z0-9-]+)\.json$/);
    if (configMatch && businessConfigs[configMatch[1]]) {
      return { ok: true, json: async () => businessConfigs[configMatch[1]] };
    }
    const matchingSlug = Object.keys(csvBySlug).find(slug => businessConfigs[slug]?.approvedCsvUrl === url.toString());
    if (matchingSlug) return { ok: true, text: async () => csvBySlug[matchingSlug] };
    return { ok: false, json: async () => ({}), text: async () => '' };
  };
  const context = {
    document,
    window: { location: { search } },
    URL,
    URLSearchParams,
    fetch,
    console: { error() {} }
  };
  vm.runInNewContext(appScript.replace(/\nloadKnowledgeBase\(\);\s*$/, '\n'), context);
  return { context, document, nodes, calls };
}

function config(slug, name, approvedCsvUrl) {
  return { slug, name, approvedCsvUrl, contactUrl: '', bookingUrl: '', accentColor: '#245f6b' };
}

test('uses the human-approved Answer column and fails closed for drafts or missing status', async () => {
  const business = config('northside-sports-therapy', 'Northside Sports Therapy', 'https://data.example/northside.csv');
  const page = makePage({
    defaultSlug: business.slug,
    businessConfigs: { [business.slug]: business },
    csvBySlug: { [business.slug]: csv }
  });

  await page.context.loadKnowledgeBase();
  assert.equal(vm.runInNewContext('data.length', page.context), 2);
  assert.equal(page.document.title, `${business.name} — Knowledge Base`);
  assert.equal(page.nodes.get('businessName').textContent, business.name);
  assert.equal(page.nodes.get('searchInput').disabled, false);
  assert.match(page.nodes.get('categorySections').innerHTML, /Approved price answer/);
  assert.doesNotMatch(page.nodes.get('categorySections').innerHTML, /DRAFT PRICE|Do not show|Draft without approved answer/);
  assert.match(page.nodes.get('categorySections').innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(page.nodes.get('categorySections').innerHTML, /<script>/);

  page.nodes.get('searchInput').value = 'cost';
  page.context.searchKB();
  assert.match(page.nodes.get('searchResults').innerHTML, /Approved price answer/);
  assert.doesNotMatch(page.nodes.get('searchResults').innerHTML, /DRAFT PRICE/);
});

test('a business query loads only that business config and its separate CSV', async () => {
  const alpha = config('northside-sports-therapy', 'Northside Sports Therapy', 'https://data.example/northside.csv');
  const beta = config('other-business', 'Other Business', 'https://data.example/other.csv');
  const otherCsv = 'Type,Category,Question,Answer,Status\nFAQ,Hours,When are you open?,Other business answer,Approved';
  const page = makePage({
    search: '?business=other-business',
    businessConfigs: { [alpha.slug]: alpha, [beta.slug]: beta },
    csvBySlug: { [alpha.slug]: csv, [beta.slug]: otherCsv }
  });

  await page.context.loadKnowledgeBase();
  assert.equal(page.nodes.get('businessName').textContent, 'Other Business');
  assert.match(page.nodes.get('categorySections').innerHTML, /Other business answer/);
  assert.doesNotMatch(page.nodes.get('categorySections').innerHTML, /Approved price answer/);
  assert.equal(page.calls.some(url => url.endsWith('/businesses/default.json')), false);
});

test('invalid tenant slugs fail before any tenant config or data is fetched', async () => {
  const page = makePage({ search: '?business=../other-business', businessConfigs: {}, csvBySlug: {} });
  await page.context.loadKnowledgeBase();
  assert.equal(page.calls.length, 0);
  assert.equal(page.nodes.get('searchInput').disabled, true);
  assert.match(page.nodes.get('loadStatus').textContent, /temporarily unavailable/);
});

test('saved business configs use distinct approved CSV sources', () => {
  const businessDir = path.join(__dirname, '..', 'businesses');
  const configs = fs.readdirSync(businessDir)
    .filter(file => file.endsWith('.json') && file !== 'default.json')
    .map(file => ({ file, value: JSON.parse(fs.readFileSync(path.join(businessDir, file), 'utf8')) }));
  const slugs = configs.map(({ value }) => value.slug);
  const sourceUrls = configs.map(({ value }) => value.approvedCsvUrl).filter(Boolean);
  const defaultConfig = JSON.parse(fs.readFileSync(path.join(businessDir, 'default.json'), 'utf8'));

  assert.ok(configs.length > 0, 'at least one business config exists');
  assert.equal(new Set(slugs).size, slugs.length, 'business slugs are unique');
  assert.equal(new Set(sourceUrls).size, sourceUrls.length, 'each business has a separate CSV source');
  assert.ok(configs.some(({ value }) => value.slug === defaultConfig.slug), 'the default slug has a matching business config');
  for (const { file, value } of configs) {
    assert.equal(file, `${value.slug}.json`, 'the filename matches its business slug');
    if (value.approvedCsvUrl) assert.equal(new URL(value.approvedCsvUrl).protocol, 'https:', 'published CSV sources use HTTPS');
  }
});

test('primary navigation stays within the selected business page', () => {
  const headerStart = html.indexOf('<header');
  const headerEnd = html.indexOf('</header>', headerStart);
  assert.ok(headerStart >= 0 && headerEnd > headerStart, 'the page header exists');
  const header = html.slice(headerStart, headerEnd);
  const navigationStart = header.indexOf('<nav');
  const navigationEnd = header.indexOf('</nav>', navigationStart);
  assert.ok(navigationStart >= 0 && navigationEnd > navigationStart, 'the page has primary navigation');
  const navigation = header.slice(navigationStart, navigationEnd);
  const links = Array.from(navigation.matchAll(/href=["']([^"']+)["']/gi), match => match[1]);

  assert.ok(links.length > 0, 'the navigation has links');
  assert.ok(links.every(href => href.startsWith('#')), 'navigation links remain within the current business page');
});

test('business configs without a dedicated approved-only feed fail closed', async () => {
  const business = config('northside-sports-therapy', 'Northside Sports Therapy', '');
  const page = makePage({
    search: '?business=northside-sports-therapy',
    businessConfigs: { [business.slug]: business },
    csvBySlug: { [business.slug]: csv }
  });

  await page.context.loadKnowledgeBase();
  assert.equal(page.calls.length, 1, 'the page fetches only the business config and no CSV');
  assert.equal(page.nodes.get('searchInput').disabled, true);
  assert.match(page.nodes.get('loadStatus').textContent, /temporarily unavailable/);
});

async function loadedPage(csvText, overrides = {}) {
  const business = { ...config('example-business', 'Example Business', 'https://data.example/example.csv'), ...overrides };
  const page = makePage({
    search: '?business=example-business',
    businessConfigs: { [business.slug]: business },
    csvBySlug: { [business.slug]: csvText }
  });
  await page.context.loadKnowledgeBase();
  return page;
}

const searchCsv = [
  'Type,Category,Question/Title,Answer,Status',
  'FAQ,Prices,How much is a sports massage?,A 60-minute sports massage is £55.,Approved',
  'FAQ,Booking,Can I cancel?,Give 24 hours notice to cancel without charge.,Approved',
  'FAQ,Visiting,Is there parking?,Free parking behind the clinic & on Elm Road.,Approved',
  'FAQ,Prices,Do you take card?,Yes. <b>Card</b> and cash.,Approved'
].join('\n');

test('search matches every word in any order and ranks question matches first', async () => {
  const page = await loadedPage(searchCsv);
  page.nodes.get('searchInput').value = 'massage price';
  page.context.searchKB();
  const html = page.nodes.get('searchResults').innerHTML;
  assert.match(html, /sports <mark>massage<\/mark>/);
  assert.doesNotMatch(html, /parking/);
  assert.match(page.nodes.get('searchHeading').textContent, /^1 answer for/);

  page.nodes.get('searchInput').value = 'CANCEL notice';
  page.context.searchKB();
  assert.match(page.nodes.get('searchResults').innerHTML, /Can I <mark>cancel<\/mark>\?/);

  page.nodes.get('searchInput').value = 'swimming';
  page.context.searchKB();
  assert.match(page.nodes.get('searchHeading').textContent, /^No answers/);
});

test('search highlighting never turns business content or the query into markup', async () => {
  const page = await loadedPage(searchCsv);
  for (const query of ['b card', 'amp parking', 'lt']) {
    page.nodes.get('searchInput').value = query;
    page.context.searchKB();
    const html = page.nodes.get('searchResults').innerHTML;
    assert.doesNotMatch(html.replace(/<\/?(mark|article|div|h3|p)( class="[a-z]+")?>/g, ''), /<[a-z\/]/i, `no raw tags for "${query}"`);
  }
  page.nodes.get('searchInput').value = 'parking';
  page.context.searchKB();
  assert.match(page.nodes.get('searchResults').innerHTML, /clinic &amp; on Elm Road/);
});

test('the health notice and header booking button follow the business config', async () => {
  const plain = await loadedPage(searchCsv);
  assert.equal(plain.nodes.get('healthNotice').hidden, true);
  assert.equal(plain.nodes.get('bookingLink').hidden, true);

  const clinic = await loadedPage(searchCsv, { healthcare: true, bookingUrl: 'https://book.example/clinic', bookingLabel: 'Book a session' });
  assert.equal(clinic.nodes.get('healthNotice').hidden, false);
  assert.equal(clinic.nodes.get('bookingLink').hidden, false);
  assert.equal(clinic.nodes.get('bookingLink').href, 'https://book.example/clinic');
  assert.equal(clinic.nodes.get('bookingLink').textContent, 'Book a session');

  const unsafe = await loadedPage(searchCsv, { bookingUrl: 'javascript:alert(1)' });
  assert.equal(unsafe.nodes.get('bookingLink').hidden, true);
});

test('each answer gets a stable, safe link anchor', async () => {
  const page = await loadedPage(searchCsv);
  const anchors = JSON.parse(vm.runInNewContext('JSON.stringify(data.map(item => item.anchor))', page.context));
  assert.deepEqual(anchors.slice(0, 2), ['q-how-much-is-a-sports-massage-1', 'q-can-i-cancel-2']);
  assert.ok(anchors.every(anchor => /^q-[a-z0-9-]+$/.test(anchor)));
  assert.equal(new Set(anchors).size, anchors.length);
});
