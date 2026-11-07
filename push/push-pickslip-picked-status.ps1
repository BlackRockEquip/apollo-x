cd "C:\Projects\Apollo X Working"
# Pick slips: Awaiting picking / Partly picked / Picked status. No migration. Close these files in your editor before running.
git add -A
@'
Pick slips: show Awaiting picking / Partly picked / Picked next to each slip

- Job > Generated pick slips and Stock Levels > Picking Slip History get a Status column.
- A slip is a list; stock comes off the shelf when each part is marked received, so the status follows that: Awaiting picking (nothing on the slip marked received yet), Partly picked (some lines, or part of a line), Picked (every line).
- When one part line is on several slips, the units taken are given to the oldest slip first. Slips whose stock was taken when they were made (Stock Levels picking, older slips) show Picked straight away.
- The job's slip list refreshes by itself when a part is marked received or the receive is undone.
- Worked out when the list is read, nothing new stored. No migration.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
