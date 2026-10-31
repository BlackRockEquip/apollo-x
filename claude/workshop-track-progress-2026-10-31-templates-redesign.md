# Workshop Track - progress note 2026-10-31 - Settings > Templates redesign

Request (2026-10-30/31): "Settings/templates - mockup a better looking ui", then "add more field labels, e.g. component, model, serial", "supplier order number?", "add each default wording", and finally "build it into the system".

## What was built (pr30, no migration)
- **Screen** (`components/CompanyTemplatesForm.tsx`, `tpl-` CSS in globals.css): three columns - template list (Default / Customised / Unsaved pill), editor (subject + message, "when is this sent" note, grouped searchable "Insert a field" panel that inserts at the cursor with a leading space, "Reset to default wording", unknown-field warning) and a live preview with highlighted example values and an attachment line for the WIP email. Read-only "Emails are sent from" bar linking to Company / Branding. Sticky save bar (Discard / Save templates) appears when something changed. RFQ and follow-up templates only show when the RFQs module is on.
- **Field catalogue** (`lib/email-template-fields.ts`, pure, shared by browser and server): default wording of every email, field groups (supplier, job, machine, component, commercial, list, company), example values, `unknownFields`, `previewParts`, `storedWording`/`isDefaultWording`, `buildJobFieldValues`, `partsCountText`, `joinOrderNumbers`.
- **Where values come from** (`lib/email-template-vars.ts`): `loadJobEmailVars` (job + customer + sales rep + machinist, Engineering wording for status/type), `loadCompanyEmailVars` (company name, sender = signed-in user, company phone, today), `supplierContactFirstName` (primary contact first, else oldest).
- **Sending**: `rfq/service.ts` (supplier contact from the RFQ-eligible contacts; supplierOrderNumber blank because no order exists yet), `jobs/parts-followup.ts` (supplier primary contact, order numbers from the outstanding lines, partsCount), `jobs/wip-email.ts` (senderName, companyPhone; `company`/`date` keep their old wording).
- **Signature** is now rendered through the same `{{field}}` filler as the message (it was appended raw before).
- **Saving** (`updateCompanyEmailTemplates`): wording equal to the default (or blank) is stored as null = "not customised".
- **Tests**: `tests/unit/email-templates.test.ts` (15).

## Decisions / things to know
- Default wording is unchanged (the follow-up default does NOT include {{supplierOrderNumber}}, unlike the mockup) so live emails don't change; add it in the follow-up template to use it.
- `{{machine}}` is "make model" (or "the unit"); use `{{machineSerial}}` for the serial.
- `{{date}}` is "13 Oct 2026" style in RFQ/follow-up; the WIP email keeps its existing "2026/10/30" style.
- "Send me a test" button from the mockup was NOT built (no user email on the request context).
