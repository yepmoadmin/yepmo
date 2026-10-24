# AI draft workflow for business information

This guide describes the current Northside prototype workflow. It is not a customer database or a healthcare records workflow.

## Before a row reaches AI

1. Prepare a complete entry containing only general business information intended for public release, such as services, prices, opening hours, booking instructions, and policies.
2. Check the question and answer for customer or patient names, contact details, appointment details, health details, or other personal information. Do not use AI Ready for a row that contains personal information, a personal conversation, a diagnosis, or personalised medical advice.
3. Add the complete row to the monitored Google Sheet with Status set to `AI Ready`. The Make scenario watches **new rows only**; changing an existing `Draft` row to `AI Ready` later will not trigger it.
4. The filter also requires non-empty Question/Title and Answer fields. Rows that remain `Draft`, or have either required field empty, will not reach the AI step.
5. A human must review the AI output. The workflow marks it for review; it does not approve or publish it. Only approved information belongs in the separate public feed.

Keep the scenario inactive until the business owner has verified the workflow and chosen to enable it. The original Northside scenario is currently inactive and has not been run.

## Privacy and content limits

`AI Ready` records a human pre-check; it is not an automatic privacy detector and cannot guarantee that personal information is absent. If a row passes the filter, its question and answer are sent to the AI provider configured in Make. The prompt can ask the model to flag apparent personal information, but that instruction happens after the row has been sent. Therefore, never enter customer or patient personal information into this workflow.

For healthcare businesses, keep entries to general operational information. Do not use this workflow to create diagnoses, treatment recommendations, or personalised medical advice. If content is unclear, contradictory, or incomplete, a human must resolve it rather than letting AI fill in the gaps.

## Latest sandbox verification

On 10 October 2026, the inactive sandbox scenario was run against a private Sheet containing synthetic data only. Two new rows marked `AI Ready` passed through the filter:

- A vague answer (`How can I find the sample business website?` / `Use the sample business website.`) produced `REVIEW NEEDED — human clarification required`.
- A complete synthetic opening-hours answer was rewritten as a draft in `AI draft answer` and its Status remained `Needs review`.

This confirmed that the filter admits complete `AI Ready` rows, incomplete information can be routed for human clarification, and a successful AI rewrite remains unapproved. The sandbox stayed inactive after the checks. The original Northside scenario and its connected Sheet were not changed.

## Current limits

- The scenario watches newly added rows; it does not process later edits to existing rows.
- The human check reduces risk but does not guarantee that personal information is caught.
- Prompt instructions do not prevent information from being sent to Make's AI provider.
- This Northside scenario is connected to one business's Sheet. It is not a multi-business automation or a tenant-isolated SaaS integration.
- AI output remains a draft until a human approves it for the separate public knowledge base.
