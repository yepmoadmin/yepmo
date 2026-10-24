# Yepmo knowledge base template

This repository serves public, static knowledge bases from one shared page template. Version 1 has no customer accounts, backend, database, analytics, or customer search storage. Search runs in the visitor's browser.

## Business data

Each business has its own JSON configuration in `businesses/<slug>.json`. Its `approvedCsvUrl` must point to that business's **published Approved-only CSV**. Do not point it at an intake, working, or AI-draft sheet: a published Google CSV can be fetched directly by anyone, even when the site UI does not display a row.

The template reads the CSV by header name, not column position. Required columns are `Type`, `Category`, `Question/Title` (or `Question`), `Answer`, and `Status`. A row is displayed only when it has a question, an answer, and a status of `Approved`. `AI draft answer` is never used by the customer-facing page.

Only general business information intended for public release belongs in these files and sheets. Do not put customer or patient names, contact details, appointment histories, profiles, medical records, or personal conversations in the knowledge base. For healthcare-related businesses, keep published content to general business and operational information. Do not create diagnoses or personalised medical advice. AI-generated content remains a draft until a human approves it.

## Existing AI draft workflow

For the human pre-check and step-by-step process for the current Make setup, see [the AI draft workflow guide](docs/ai-draft-workflow.md).

The Northside Make prototype watches new Google Sheets rows. Its saved route passes only rows whose Status is exactly `AI Ready` and whose Question/Title and Answer fields are non-empty. Make sends those values to the AI, writes the result to `AI draft answer`, and sets Status to `Needs review`. The customer-facing page uses the separate approved feed and displays only rows marked `Approved`.

A human must check a row before marking it `AI Ready`. This is a pre-check, not a privacy detector or a guarantee: any row that passes the filter is sent to the AI provider. Never use this workflow for customer or patient personal information, diagnoses, or personalised medical advice. The current Northside scenario is inactive and is not a reusable, tenant-isolated automation.

## Add a business

1. Give the business its own Google Sheet, separate from every other business. Keep a working tab for intake and drafts, and a separate **Approved** tab that contains only the columns `Type`, `Category`, `Question/Title`, `Answer`, `Status` (an `ID` column is also allowed) and only rows whose Status is `Approved`.
2. Publish **only the Approved tab** to the web as CSV (File > Share > Publish to web > choose the Approved tab > Comma-separated values). Never publish the whole document or the working tab.
3. Add `businesses/<slug>.json` with a unique slug, the business name, that business's own approved CSV link, and optional public HTTPS contact or booking links:

```json
{
  "slug": "example-business",
  "name": "Example Business",
  "approvedCsvUrl": "https://docs.google.com/spreadsheets/d/e/.../pub?gid=...&single=true&output=csv",
  "contactUrl": "",
  "bookingUrl": "",
  "bookingLabel": "Book now",
  "accentColor": "#245f6b",
  "healthcare": false
}
```

Set `"healthcare": true` for clinics, therapists and other health businesses. The page then shows a notice that answers are general information only and that personal medical questions should go to a qualified practitioner.

4. Run the preflight check (below). Fix every `✗` error; read every `!` warning.
5. Open `?business=<slug>` on the hosted site. The root URL uses the slug in `businesses/default.json`.

Keep every business on its own source URL. The slug selects one config, which selects one CSV; the page loads only that business's answers and never falls back to another business's feed.

## Preflight check

`tools/check-business.cjs` checks businesses before they go live. It uses the page's own CSV parser and approval filter, so it sees a feed exactly as the public page does. It needs only Node.js (no installs).

```text
node tools/check-business.cjs                       # check every business config (runs in CI)
node tools/check-business.cjs --live                # also download and check every live feed
node tools/check-business.cjs --live <slug>         # download and check one business's feed
node tools/check-business.cjs --csv feed.csv --business <slug>   # check a saved CSV export
```

**Config errors:** missing or non-HTTPS feed link, a Google Sheet *edit* link used as a feed, non-HTTPS contact/booking links, unknown settings, a file name that does not match the slug, duplicate slugs, two businesses sharing one feed, or a default slug with no config.

**Feed errors:** missing required columns; extra columns such as `AI draft answer` (anyone with the CSV link can read every published column, even ones the page ignores); any row that is not `Approved` (the page hides it, but it is still public in the feed); and approved answers that still contain `REVIEW NEEDED`.

**Feed warnings:** answers containing an email address or phone number (confirm it is the business's own public contact detail, never a customer's), approved rows with no question or answer, duplicate questions, and an empty feed.

The check finds common setup mistakes. It does not prove that answers are accurate or free of personal data; a human still reviews and approves every answer.

## Tests

With Node.js installed, run:

```text
node --test tests/*.cjs
```

The page tests cover approval filtering, using the `Answer` column rather than the AI draft, independent business configs, invalid tenant slugs, fail-closed behaviour when no approved feed is configured, in-page navigation, and HTML escaping. The preflight tests cover each config and feed rule above using synthetic data only. GitHub Actions runs both the tests and the offline config check on every push and pull request.

## Current limits

This is a public knowledge-base renderer, not a private client portal. Anyone can view each business's published information and can select another public business slug. Client authentication, private drafts, and cross-tenant private storage are out of scope for version 1.
