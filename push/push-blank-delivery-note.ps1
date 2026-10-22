cd "C:\Projects\Apollo X Working"
# Outwork page: "Blank Delivery Note" button. No database change.
# Close the project files in your editor before running.
git add -A
@'
Outwork page: Blank Delivery Note

- New "Blank Delivery Note" button on the Outwork page opens a dialog: pick a customer or a supplier, type the job number, type the PO reference (required, never pulled from a job), set the delivery date, list the items being delivered (description + qty, add as many as needed) and add notes.
- "Print / PDF" builds the delivery note with the company letterhead and the Dispatched by / Received by name, signature and date fields, and opens it in a new tab to print or save. Nothing is stored on a job.
- Same title as the other delivery notes (Configuration > Document titles > Delivery Note). New route POST /api/v1/outwork/blank-delivery-note; needs Outwork licensed, Jobs view and Customers / Suppliers view for the chosen party.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
