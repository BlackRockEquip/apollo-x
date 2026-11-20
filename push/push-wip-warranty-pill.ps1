cd "C:\Projects\Apollo X Working"
# Jobs & WIP: warranty status pill beside the status. No migration.
git add -A
@'
Jobs & WIP: show the warranty status pill beside the status

- The Status column of the Jobs & WIP table now shows "Warranty · Pending / Granted / Declined" beside the status pill (like the job screen header), for every warranty job, workshop or field.
- The board view's cards show the same pill.
- "Warranty" is also a value in the Status column filter, so warranty jobs can be filtered.
- The jobs list query now loads the warranty flag and claim status.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
