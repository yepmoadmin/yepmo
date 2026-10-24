const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const clinicCsv = [
  'Type,Category,Question/Title,Answer,Status',
  'FAQ,Prices,How much is a sports massage?,A 30-minute sports massage is £38 and a 60-minute session is £58.,Approved',
  'FAQ,Opening hours,When are you open?,Monday to Thursday 8am to 8pm. Saturday 9am to 1pm.,Approved',
  'Policy,Booking,What is your cancellation policy?,Please give at least 24 hours notice to cancel.,Approved',
  'FAQ,Your visit,Is there parking?,Free parking behind the clinic.,Approved',
  'FAQ,Prices,Do you accept health insurance?,We are registered with Bupa and AXA Health.,Approved',
  'FAQ,Prices,Do you offer student discounts?,DRAFT maybe 10%,Needs review',
  'FAQ,Treatment,<img src=x onerror=alert(1)>,<script>alert(1)</script>,Approved'
].join('\n');

async function page({ healthcare = true, csv = clinicCsv } = {}) {
  const calls = [];
  const nodes = new Map();
  const node = () => ({ textContent: '', value: '', disabled: false, hidden: false, innerHTML: '',
    classList: { toggle() {} }, addEventListener() {} });
  const config = { slug: 'harbourside', name: 'Harbourside Physio', approvedCsvUrl: 'https://data.example/h.csv',
    contactUrl: 'https://example.com/contact', bookingUrl: '', healthcare };
  const context = {
    document: { title: '', baseURI: 'https://example.test/', documentElement: { style: { setProperty() {} } },
      getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); } },
    window: { location: { search: '?business=harbourside' } },
    URL, URLSearchParams, console: { error() {} },
    fetch: async url => {
      calls.push(String(url));
      if (String(url).endsWith('/businesses/harbourside.json')) return { ok: true, json: async () => config };
      if (String(url) === config.approvedCsvUrl) return { ok: true, text: async () => csv };
      return { ok: false };
    }
  };
  vm.runInNewContext(appScript.replace(/\nloadKnowledgeBase\(\);\s*$/, '\n'), context);
  await context.loadKnowledgeBase();
  const ask = message => {
    nodes.get('askLog').innerHTML = '';
    context.askSubmit(message);
    return nodes.get('askLog').innerHTML;
  };
  const kind = message => vm.runInNewContext(`askReply(${JSON.stringify(message)}).kind`, context);
  return { ask, kind, calls, nodes, context };
}

test('answers natural questions with the approved answer word for word', async () => {
  const p = await page();
  assert.match(p.ask('how much does a massage cost?'), /A 30-minute sports massage is £38 and a 60-minute session is £58\./);
  assert.match(p.ask('what time do you open on saturday'), /Saturday 9am to 1pm/);
  assert.match(p.ask('can I park there'), /Free parking behind the clinic/);
  assert.match(p.ask('I need to cancel my appointment'), /24 hours notice/);
  assert.match(p.ask('do you take bupa'), /registered with Bupa/);
});

test('never shows unapproved drafts and admits when it has no answer', async () => {
  const p = await page();
  const reply = p.ask('do you offer a student discount');
  assert.doesNotMatch(reply, /DRAFT|10%/);
  assert.match(reply, /don't have an approved answer/);
  assert.match(p.ask('do you sell pizza'), /don't have an approved answer/);
});

test('refuses to handle personal details and does not echo them back', async () => {
  const p = await page();
  for (const message of ['my email is jo.bloggs@example.com', 'call me on 07700 900123', 'my name is Jo and my postcode is PO7 7AA', 'my date of birth is 1/2/80']) {
    assert.equal(p.kind(message), 'personal', message);
    const log = p.ask(message);
    assert.match(log, /don't share personal details/);
    assert.doesNotMatch(log, /jo\.bloggs|07700|PO7|1\/2\/80/i);
  }
});

test('health businesses: symptom questions get a practitioner redirect, never advice', async () => {
  const p = await page();
  assert.equal(p.kind('my knee hurts when I run, what is wrong with it?'), 'clinical');
  const reply = p.ask('I have back pain, should I rest or stretch?');
  assert.match(reply, /can't assess symptoms or give medical advice/);
  assert.doesNotMatch(reply, /999/);
  assert.match(p.ask('chest pain and I can\'t breathe'), /call 999/);
  assert.match(p.ask('how much is a massage for my sore back'), /practitioner/);
});

test('non-health businesses answer normally without the medical redirect', async () => {
  const p = await page({ healthcare: false });
  assert.equal(p.kind('my feet hurt, when are you open?'), 'answer');
});

test('everything shown is escaped and nothing typed is sent anywhere', async () => {
  const p = await page();
  const before = p.calls.length;
  const log = p.ask('<img src=x onerror=alert(1)> treatment');
  p.ask('when are you open');
  assert.doesNotMatch(log, /<img|<script/);
  assert.equal(p.calls.length, before, 'the assistant makes no network requests');
});

test('the assistant stays hidden when the knowledge base fails to load', async () => {
  const p = await page({ csv: 'not,a,valid,feed' });
  assert.equal(p.nodes.get('askOpen').hidden, true);
  assert.equal(p.ask('when are you open'), '');
});
