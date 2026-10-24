#!/usr/bin/env node
// Yepmo business preflight check.
//
// Checks business configs (offline) and, optionally, each business's published
// approved CSV feed before it goes live. It reuses the CSV parsing and approval
// filter from index.html, so it judges the feed exactly as the public page would.
//
// Usage:
//   node tools/check-business.cjs                      check every config (offline)
//   node tools/check-business.cjs --live [slug ...]    also download and check feeds
//   node tools/check-business.cjs --csv <file> --business <slug>
//                                                      check a locally saved CSV export
//
// Exit code is 1 when any error is found, 0 otherwise. Warnings never fail.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const BUSINESS_DIR = path.join(ROOT, 'businesses');
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONFIG_KEYS = new Set(['slug', 'name', 'approvedCsvUrl', 'contactUrl', 'bookingUrl', 'bookingLabel', 'accentColor', 'healthcare']);
// Columns the public page reads, plus an optional row ID. Anything else in a
// published feed is readable by anyone who opens the CSV link.
const PUBLIC_COLUMNS = new Set(['id', 'type', 'category', 'question/title', 'question', 'answer', 'status']);
const REVIEW_MARKER = /review needed|human clarification required/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\b/;

function loadPageFunctions() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('index.html has no inline application script');
  const stubNode = { addEventListener() {}, classList: { toggle() {} } };
  const context = {
    document: { getElementById: () => stubNode, documentElement: { style: { setProperty() {} } } },
    window: { location: { search: '' } },
    URL, URLSearchParams, console
  };
  vm.runInNewContext(script.replace(/\nloadKnowledgeBase\(\);\s*$/, '\n'), context);
  return { parseCSV: context.parseCSV, mapApprovedCsv: context.mapApprovedCsv };
}

function isHttps(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function checkConfig(file, config) {
  const errors = [];
  const warnings = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { errors: ['config is not a JSON object'], warnings };
  }
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.has(key)) errors.push(`unknown setting "${key}" (allowed: ${[...CONFIG_KEYS].join(', ')})`);
  }
  if (typeof config.slug !== 'string' || !SLUG_PATTERN.test(config.slug)) {
    errors.push('slug must use lowercase letters, numbers and single hyphens');
  } else if (file !== `${config.slug}.json`) {
    errors.push(`file name must be ${config.slug}.json`);
  }
  if (typeof config.name !== 'string' || !config.name.trim()) errors.push('name is required');

  const feed = config.approvedCsvUrl;
  if (typeof feed !== 'string' || !feed.trim()) {
    errors.push('approvedCsvUrl is required (the page will refuse to load without it)');
  } else if (!isHttps(feed)) {
    errors.push('approvedCsvUrl must be an https:// link');
  } else {
    const url = new URL(feed);
    if (url.hostname === 'docs.google.com') {
      if (/\/edit\b/.test(url.pathname)) errors.push('approvedCsvUrl is a Sheet edit link; use File > Share > Publish to web > CSV for the Approved tab');
      else if (url.searchParams.get('output') !== 'csv') warnings.push('approvedCsvUrl does not ask Google for output=csv');
      if (!url.searchParams.has('gid')) warnings.push('approvedCsvUrl has no gid, so Google may publish the first tab instead of the Approved tab');
    }
  }
  for (const key of ['contactUrl', 'bookingUrl']) {
    const value = config[key];
    if (value !== undefined && value !== '' && !isHttps(value)) errors.push(`${key} must be empty or an https:// link`);
  }
  if (config.bookingLabel !== undefined && typeof config.bookingLabel !== 'string') errors.push('bookingLabel must be text');
  if (config.healthcare !== undefined && typeof config.healthcare !== 'boolean') errors.push('healthcare must be true or false');
  if (config.accentColor !== undefined && !/^#[0-9a-f]{6}$/i.test(String(config.accentColor))) {
    errors.push('accentColor must be a six-digit hex colour such as #245f6b');
  }
  return { errors, warnings };
}

function loadConfigs(dir = BUSINESS_DIR) {
  const configs = [];
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json') && name !== 'default.json').sort()) {
    let value = null;
    let parseError = null;
    try { value = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); }
    catch (error) { parseError = `invalid JSON: ${error.message}`; }
    configs.push({ file, value, parseError });
  }
  let defaultConfig = null;
  try { defaultConfig = JSON.parse(fs.readFileSync(path.join(dir, 'default.json'), 'utf8')); } catch { /* reported below */ }
  return { configs, defaultConfig };
}

function checkAllConfigs({ configs, defaultConfig }) {
  const results = new Map();
  const bySlug = new Map();
  const byFeed = new Map();
  for (const { file, value, parseError } of configs) {
    const result = parseError ? { errors: [parseError], warnings: [] } : checkConfig(file, value);
    results.set(file, result);
    if (!value) continue;
    if (value.slug) (bySlug.get(value.slug) || bySlug.set(value.slug, []).get(value.slug)).push(file);
    if (value.approvedCsvUrl) {
      const key = value.approvedCsvUrl.trim();
      (byFeed.get(key) || byFeed.set(key, []).get(key)).push(file);
    }
  }
  for (const files of bySlug.values()) {
    if (files.length > 1) for (const file of files) results.get(file).errors.push(`slug is also used by ${files.filter(f => f !== file).join(', ')}`);
  }
  for (const files of byFeed.values()) {
    if (files.length > 1) for (const file of files) results.get(file).errors.push(`approved feed is shared with ${files.filter(f => f !== file).join(', ')}; every business needs its own feed`);
  }
  const general = { errors: [], warnings: [] };
  if (!configs.length) general.errors.push('no business configs found');
  if (!defaultConfig) general.errors.push('businesses/default.json is missing or invalid');
  else {
    const extra = Object.keys(defaultConfig).filter(key => key !== 'slug');
    if (extra.length) general.errors.push(`default.json should only contain "slug" (found ${extra.join(', ')})`);
    if (!configs.some(({ value }) => value && value.slug === defaultConfig.slug)) {
      general.errors.push(`default slug "${defaultConfig.slug}" has no matching business config`);
    }
  }
  results.set('default.json', general);
  return results;
}

function checkFeed(csvText, { parseCSV, mapApprovedCsv }) {
  const errors = [];
  const warnings = [];
  const rows = parseCSV(String(csvText).replace(/^﻿/, ''));
  const header = (rows[0] || []).map(value => value.trim());
  const lower = header.map(value => value.toLowerCase());

  let approved = [];
  try { approved = mapApprovedCsv(csvText); }
  catch (error) { errors.push(error.message); return { errors, warnings, summary: { rows: 0, shown: 0 } }; }

  const extra = header.filter((name, index) => name && !PUBLIC_COLUMNS.has(lower[index]));
  if (extra.length) {
    errors.push(`feed publishes columns the page does not use: ${extra.join(', ')}. Anyone with the link can read them; remove them from the approved tab`);
  }
  const blankHeaders = header.filter(name => !name).length;
  if (blankHeaders) warnings.push(`${blankHeaders} column(s) have no header; make sure they are empty`);

  const statusIndex = lower.indexOf('status');
  const dataRows = rows.slice(1).filter(row => row.some(cell => cell.trim()));
  const notApproved = dataRows
    .map((row, index) => ({ line: index + 2, status: (row[statusIndex] || '').trim() }))
    .filter(row => row.status.toLowerCase() !== 'approved');
  if (notApproved.length) {
    const sample = notApproved.slice(0, 5).map(row => `line ${row.line} (${row.status || 'blank'})`).join(', ');
    errors.push(`${notApproved.length} row(s) are not Approved but are still publicly readable in the feed: ${sample}. The page hides them, but the feed should contain approved rows only`);
  }
  const hidden = dataRows.length - notApproved.length - approved.length;
  if (hidden > 0) warnings.push(`${hidden} Approved row(s) have no question or answer and will not be shown`);

  const seen = new Map();
  approved.forEach(item => {
    const text = `${item.question}\n${item.answer}`;
    if (REVIEW_MARKER.test(text)) errors.push(`approved answer still contains a review marker: "${item.question.slice(0, 60)}"`);
    if (EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text)) {
      warnings.push(`"${item.question.slice(0, 60)}" contains an email address or phone number; confirm it is the business's own public contact detail, not a customer's`);
    }
    const key = item.question.trim().toLowerCase();
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  for (const [question, count] of seen) if (count > 1) warnings.push(`question appears ${count} times: "${question.slice(0, 60)}"`);
  if (!approved.length) warnings.push('no approved answers will be shown; the page will say none are available yet');

  return { errors, warnings, summary: { rows: dataRows.length, shown: approved.length } };
}

async function fetchFeed(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`feed returned HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  const text = await response.text();
  if (/text\/html/i.test(type) || /^\s*<!doctype html|^\s*<html/i.test(text)) {
    throw new Error('feed returned a web page, not CSV; check the Sheet is published to the web as CSV');
  }
  return text;
}

function report(label, { errors, warnings }, lines) {
  for (const message of errors) lines.push(`  ✗ ${label}: ${message}`);
  for (const message of warnings) lines.push(`  ! ${label}: ${message}`);
  return errors.length;
}

async function main(argv) {
  const args = argv.slice(2);
  const live = args.includes('--live');
  const csvIndex = args.indexOf('--csv');
  const businessIndex = args.indexOf('--business');
  const named = args.filter((arg, index) => !arg.startsWith('--') && index !== csvIndex + 1 && index !== businessIndex + 1);

  const lines = [];
  let errorCount = 0;
  const loaded = loadConfigs();
  const results = checkAllConfigs(loaded);
  for (const [file, result] of results) errorCount += report(file, result, lines);

  const page = (live || csvIndex >= 0) ? loadPageFunctions() : null;
  if (csvIndex >= 0) {
    const file = args[csvIndex + 1];
    const slug = businessIndex >= 0 ? args[businessIndex + 1] : null;
    if (!file || !slug) { console.error('Usage: --csv <file> --business <slug>'); return 2; }
    if (!loaded.configs.some(({ value }) => value && value.slug === slug)) {
      errorCount += report(slug, { errors: ['no business config with that slug'], warnings: [] }, lines);
    }
    const result = checkFeed(fs.readFileSync(file, 'utf8'), page);
    errorCount += report(`${slug} feed (${path.basename(file)})`, result, lines);
    lines.push(`  · ${slug}: ${result.summary.rows} row(s) in file, ${result.summary.shown} would be shown`);
  }
  if (live) {
    const targets = loaded.configs.filter(({ value }) => value && (!named.length || named.includes(value.slug)));
    for (const missing of named.filter(slug => !targets.some(({ value }) => value.slug === slug))) {
      errorCount += report(missing, { errors: ['no business config with that slug'], warnings: [] }, lines);
    }
    for (const { value } of targets) {
      if (!isHttps(value.approvedCsvUrl)) continue; // already reported as a config error
      try {
        const result = checkFeed(await fetchFeed(value.approvedCsvUrl), page);
        errorCount += report(`${value.slug} feed`, result, lines);
        lines.push(`  · ${value.slug}: ${result.summary.rows} row(s) in feed, ${result.summary.shown} shown on the page`);
      } catch (error) {
        errorCount += report(`${value.slug} feed`, { errors: [error.message], warnings: [] }, lines);
      }
    }
  }

  console.log(`Yepmo business check: ${loaded.configs.length} business config(s)${live ? ', live feeds checked' : ''}`);
  if (lines.length) console.log(lines.join('\n'));
  console.log(errorCount ? `FAILED with ${errorCount} error(s)` : 'OK');
  return errorCount ? 1 : 0;
}

module.exports = { checkConfig, checkAllConfigs, checkFeed, loadConfigs, loadPageFunctions };

if (require.main === module) {
  main(process.argv).then(code => { process.exitCode = code; }, error => {
    console.error(error);
    process.exitCode = 1;
  });
}
