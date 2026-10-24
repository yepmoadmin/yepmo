const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { checkConfig, checkAllConfigs, checkFeed, loadConfigs, loadPageFunctions } = require('../tools/check-business.cjs');

const page = loadPageFunctions();
const good = (overrides = {}) => ({
  slug: 'example-business',
  name: 'Example Business',
  approvedCsvUrl: 'https://docs.google.com/spreadsheets/d/e/EXAMPLE/pub?gid=1&single=true&output=csv',
  contactUrl: '',
  bookingUrl: '',
  accentColor: '#245f6b',
  ...overrides
});

test('the repository business configs pass the preflight check', () => {
  const results = checkAllConfigs(loadConfigs());
  for (const [file, result] of results) assert.deepEqual(result.errors, [], `${file} has no errors`);
});

test('a valid config passes; unsafe or unknown settings are rejected', () => {
  assert.deepEqual(checkConfig('example-business.json', good()).errors, []);
  const bad = checkConfig('wrong-name.json', good({
    approvedCsvUrl: 'http://example.com/feed.csv',
    bookingUrl: 'javascript:alert(1)',
    accentColor: 'red',
    draftCsvUrl: 'https://example.com/drafts.csv'
  })).errors.join('\n');
  assert.match(bad, /file name must be example-business\.json/);
  assert.match(bad, /approvedCsvUrl must be an https/);
  assert.match(bad, /bookingUrl must be empty or an https/);
  assert.match(bad, /accentColor/);
  assert.match(bad, /unknown setting "draftCsvUrl"/);
});

test('a Google Sheet edit link is rejected as an approved feed', () => {
  const result = checkConfig('example-business.json', good({ approvedCsvUrl: 'https://docs.google.com/spreadsheets/d/abc/edit#gid=0' }));
  assert.match(result.errors.join('\n'), /edit link/);
});

test('two businesses sharing one feed or slug are both flagged', () => {
  const results = checkAllConfigs({
    defaultConfig: { slug: 'alpha' },
    configs: [
      { file: 'alpha.json', value: good({ slug: 'alpha', name: 'Alpha' }) },
      { file: 'beta.json', value: good({ slug: 'beta', name: 'Beta' }) }
    ]
  });
  assert.match(results.get('alpha.json').errors.join('\n'), /shared with beta\.json/);
  assert.match(results.get('beta.json').errors.join('\n'), /shared with alpha\.json/);
});

test('the default business must exist and default.json holds only a slug', () => {
  const results = checkAllConfigs({
    defaultConfig: { slug: 'missing', approvedCsvUrl: 'https://example.com/x.csv' },
    configs: [{ file: 'alpha.json', value: good({ slug: 'alpha' }) }]
  });
  const errors = results.get('default.json').errors.join('\n');
  assert.match(errors, /no matching business config/);
  assert.match(errors, /should only contain "slug"/);
});

test('a clean approved-only feed passes', () => {
  const csv = 'Type,Category,Question/Title,Answer,Status\nFAQ,Hours,When are you open?,Mon-Fri 9am-5pm,Approved\n';
  const result = checkFeed(csv, page);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.summary, { rows: 1, shown: 1 });
});

test('a feed that publishes drafts or unapproved rows fails even though the page hides them', () => {
  const csv = [
    'Type,Category,Question/Title,AI draft answer,Answer,Status',
    'FAQ,Hours,When are you open?,Draft text,Mon-Fri,Approved',
    'FAQ,Prices,How much?,Guessed price,,Needs review',
    'FAQ,Prices,Parking?,,,'
  ].join('\n');
  const errors = checkFeed(csv, page).errors.join('\n');
  assert.match(errors, /columns the page does not use: AI draft answer/);
  assert.match(errors, /2 row\(s\) are not Approved/);
  assert.match(errors, /line 3 \(Needs review\)/);
  assert.match(errors, /line 4 \(blank\)/);
});

test('missing required columns and leftover review markers fail', () => {
  assert.match(checkFeed('Question,Answer\nA,B', page).errors.join('\n'), /missing required columns/);
  const flagged = 'Type,Category,Question,Answer,Status\nFAQ,Web,Website?,REVIEW NEEDED — human clarification required,Approved';
  assert.match(checkFeed(flagged, page).errors.join('\n'), /review marker/);
});

test('contact details in answers are warned about, not silently passed', () => {
  const csv = 'Type,Category,Question,Answer,Status\nFAQ,Contact,How do I reach you?,Email hello@example.com or call 023 9200 0000,Approved';
  const result = checkFeed(csv, page);
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join('\n'), /email address or phone number/);
});

test('the command line checks a saved CSV against a business and exits non-zero on errors', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yepmo-'));
  const tool = path.join(__dirname, '..', 'tools', 'check-business.cjs');
  const slug = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'businesses', 'default.json'), 'utf8')).slug;
  const clean = path.join(dir, 'clean.csv');
  const dirty = path.join(dir, 'dirty.csv');
  fs.writeFileSync(clean, 'Type,Category,Question/Title,Answer,Status\nFAQ,Hours,Open?,Weekdays,Approved\n');
  fs.writeFileSync(dirty, 'Type,Category,Question/Title,Answer,Status\nFAQ,Hours,Open?,Weekdays,Needs Review\n');

  const ok = execFileSync(process.execPath, [tool, '--csv', clean, '--business', slug], { encoding: 'utf8' });
  assert.match(ok, /OK/);
  assert.throws(
    () => execFileSync(process.execPath, [tool, '--csv', dirty, '--business', slug], { encoding: 'utf8', stdio: 'pipe' }),
    error => error.status === 1 && /not Approved/.test(error.stdout)
  );
});
