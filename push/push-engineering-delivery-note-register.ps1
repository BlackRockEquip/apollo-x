cd "C:\Projects\Apollo X Working"
# Engineering: delivery note register. Has a migration (20261029130000_job_delivery_notes) - it runs on deploy.
git add -A
@'
Engineering: delivery note register

Every delivery note printed on an Engineering job is now recorded and numbered per job: BRE1122-DN1, BRE1122-DN2, and so on. The number is printed on the note above the delivery date and is part of the saved PDF.

New "Delivery notes" register (button on the Jobs page): all notes issued, newest first, with search by note number, job number or customer, a delivery date range, what was on each note, who issued it and when. The note number links to the job.

On the job screen a "Delivery notes" list shows that job's notes, oldest first, with a Reprint button that prints the note exactly as it was issued (same number, date and lines) without creating a new record.

The note is recorded at the moment it is printed. If recording fails, the print window is closed and an error is shown, so no unnumbered note leaves the workshop. Works for single-item and multi-item Engineering jobs; other builds are unchanged.

New table JobDeliveryNote (migration 20261029130000_job_delivery_notes). Numbering and line rules are in src/lib/jobs/item-model.ts (tested).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
