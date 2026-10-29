cd "C:\Projects\Apollo X Working"
# Engineering: several items on one job. Two migrations (new JobItem table, three new activity types). Nothing existing is changed or backfilled.
git add -A
@'
Engineering: several items on one job

A customer can now send several items in together and the company books them on ONE job (e.g. Blackrock sends 5 items to Hi-Gear). Engineering companies only; Workshop and Field service are unchanged.

New Job: the Machine / component card becomes an "Items received" table (component, component model, serial, machine make and model, work requested; more details per row). Add item, duplicate (serials cleared), "Add N more like item 1" and "Paste from spreadsheet". One item behaves exactly like today's job; several are saved on the one job with the customer, PO, dates, transport and notes entered once.

Job screen: the job lists its items as tags (job number -1, -2 ...) each with its own status, ETA and machinist ETA. An item can be moved, edited or removed on its own. The job status follows the least advanced item; while items differ the header and the Jobs list show "Mixed" with a colour bar (one segment per item) and "N of M ready". An ordinary one-item job offers "Add another item", which turns the existing machine / component details into item 1. The job-level stepper still moves every item at once; close and reopen apply to all items.

Jobs list: an items chip beside the job number, the Mixed bar in the status column, and "Mixed" in the Status column filter.

Data: new JobItem table (migration 20261029120100) and ITEM_ADDED / ITEM_UPDATED / ITEM_REMOVED activity types (20261029120000). A job with no item rows is an ordinary job, so existing jobs are not touched. Item 1's machine / component fields are mirrored onto the job so lists, search and printed documents keep working. New endpoints: POST /api/v1/jobs/[id]/items, PATCH and DELETE with ?itemId=. Rules (tags, Mixed roll-up, paste parsing) are in src/lib/jobs/item-model.ts (tested). Quote and invoice are not part of this change. Parts, outwork, specifications and delivery notes are still per job for now.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
