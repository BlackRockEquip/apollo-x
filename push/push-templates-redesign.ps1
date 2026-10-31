cd "C:\Projects\Apollo X Working"
# Settings > Templates redesign: new screen, many more email fields, filled in when emails are sent. No migration.
git add -A
@'
Settings > Templates: redesigned page, more email fields (job, machine, component, supplier order number, sender)

- New Templates screen: list of templates (Default / Customised / Unsaved), editor with a searchable "Insert a field" panel that inserts at the cursor in the subject or message, and a live preview with example job details. Every template starts with its default wording written out in full; "Reset to default wording" brings it back. A save bar appears when something changed. Warns when a {{field}} cannot be filled in by that email.
- New fields, all filled in when the email is really sent: supplierContact, supplierOrderNumber, partsCount; jobType, jobStatus, customerName, customerReference, customerPo, dateIn, etaDate, salesRep, machinist; machineMake, machineModel, machineSerial, plantNumber, machineHours; component, componentModel, componentSerial, componentPartNumber, componentType; quoteNumber, salesOrderNumber, purchaseOrderNumber, invoiceNumber; senderName, companyPhone. The quote request, parts follow-up and Jobs & WIP table emails use them.
- The signature is filled in too, so it can sign off with {{senderName}} / {{company}} / {{companyPhone}}.
- Wording that is exactly the default is saved as "not customised", so a later improvement to a default reaches companies that never changed it. Default wording is unchanged, so nothing changes in emails already being sent.
- Tests: field catalogue, defaults, saving, new fields.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
