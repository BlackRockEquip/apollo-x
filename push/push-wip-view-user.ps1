cd "C:\Projects\Apollo X Working"
# WIP View user type (Engineering): fixed 5-column Jobs & WIP table, completed jobs hidden, no job screen. "Machinist ETA" label. No migration.
# Close the project files in your editor before running.
git add -A
@'
WIP View user type: fixed 5-column Jobs & WIP table, completed jobs hidden, table only; Engineering label "Machinist ETA"

- WIP View (View Only) sees only the Jobs & WIP table with Job #, Job type, Machine model, Component and Machinist ETA. No custom columns, no Open button, no job screen (opening a job address sends them back to the table, and the job API refuses them).
- Completed jobs are hidden for this user type: the list is always the work in progress, enforced on the server.
- Engineering Business: the "Mechanic ETA date" field is now "Machinist ETA" on the job screen, the printed job card and the table columns. Workshop keeps its wording.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
