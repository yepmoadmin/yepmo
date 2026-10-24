# Yepmo: rules for working on this repository

Yepmo gives each small business its own public, searchable knowledge base built from general business information that a human has approved. The owner runs the business and is not a developer: make sensible technical decisions yourself, explain important choices in plain language, and ask only for decisions that belong to the owner or for access only they can provide.

## Non-negotiable product rules

1. **Business information only.** Never collect or store customer or patient personal data. No CRM, customer database, profiles, appointment history, medical records, or stored customer conversations. Customers never need an account to search.
2. **AI must not invent facts.** Nothing customer-facing may state a price, service, opening time, policy, qualification, guarantee, contact detail or medical claim that is not in the business's approved information. Missing, vague or contradictory information is flagged for a human, never filled in.
3. **Only approved information is public.** AI output is always a draft until a human approves it. The site shows only rows with Status `Approved` from that business's own approved-only feed.
4. **Healthcare businesses:** no diagnoses or personalised medical advice. Point clinical questions to a qualified practitioner.
5. **Businesses stay separate.** Each business has its own config (`businesses/<slug>.json`) and its own approved feed. Never fall back to, mix in, or share another business's data.
6. **Low cost, low complexity.** Prefer free tools. Keep the Google Sheets + Make workflow while it works. Do not add a database, authentication, billing, paid APIs or servers until the owner decides they are needed.

## Live changes need the owner's approval

- Do not merge to `main`, deploy, or change live data without the owner's explicit approval. `main` is what the public website serves.
- Do not change the original Northside Make scenario (`7096756`) or its Sheet. Use synthetic data and the sandbox scenario (`7870700`) for experiments, and leave the sandbox inactive afterwards.

## How to work

- Inspect the current code, branches and checks before changing anything.
- Work on a branch and open a pull request; keep unrelated edits out.
- Run `node --test tests/*.cjs` and `node tools/check-business.cjs`. Only report checks you actually ran.
- Before finishing, review the diff for: business separation, approved-only display, escaping of untrusted content, accidental personal-data collection, and changes to the Make workflow.
- Keep `README.md` and `docs/` describing the real behaviour.
