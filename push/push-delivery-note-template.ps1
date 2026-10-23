cd "C:\Projects\Apollo X Working"
# Delivery notes: one shared template (blank / job / outwork); PO reference beside the party details; customer name bold; gap before the table.
# Also updates the proposal tests for the removed First-12-months total (needed for the Render build).
# No database change.
# Close the project files in your editor before running.
git add -A
@'
Delivery notes: one shared template; PO reference beside the customer details; bold name; gap above the table

- Blank Delivery Note: the PO reference moves to the right of the customer / supplier details, under "Commercial & logistics", like the job delivery note. The job number and delivery date stay top right.
- The customer / supplier name is bold, and there is clear space between the details and the table.
- The same template is now used for every delivery note: blank, job (saved PDF) and outwork (saved PDF and the print window). Outwork shows the supplier details on the left and the machine make / model / serial on the right, and keeps its Checked column and vehicle reg line.
- PDF renderer: new "spacer" block and a bold-first-line option for line blocks (also accepted by the save-document validation).
- Tests: delivery note layout tests for all three notes; proposal tests updated for the removed First 12 months total and the Initials box.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
