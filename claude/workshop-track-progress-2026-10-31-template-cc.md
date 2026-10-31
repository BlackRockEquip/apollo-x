# Workshop Track - progress note 2026-10-31 - CC on email templates

Request: "add fields on the template for emails to be cc'd".

- Each of the three templates (Quote request, Parts follow-up, Jobs & WIP table email) has a **CC** box on Settings > Templates. Addresses are separated by commas, semicolons or spaces (max 10), saved tidy (lower case, no repeats); empty = nobody copied. The signature has no CC (it is part of every email).
- **Migration** `20261031090000_email_template_cc`: `CompanySettings.rfqEmailCc / followupEmailCc / wipEmailCc` (nullable TEXT). Needs `prisma migrate deploy` + `prisma generate`.
- Sending: `sendEmail` takes `cc`; RFQ, follow-up and WIP table emails pass their template's CC. Anyone already on the To line is dropped from CC (`ccForSend`).
- Validation in the screen (error under the box, Save disabled) and on the server (zod refine) via `ccProblem` in `lib/email-template-fields.ts`.
- Preview shows the Cc line. A template with a CC shows "Customised". "Reset to default wording" does not clear the CC.
- WIP email: the To addresses are still typed in the Email window each time; the CC comes from the template.
- Tests: `tests/unit/email-templates.test.ts` now 20.
