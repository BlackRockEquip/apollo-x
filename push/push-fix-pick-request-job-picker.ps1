cd "C:\Projects\Apollo X Working"
# Mechanic pick slip request: job picker shows the job number only. No migration.
git add -A
@'
Pick slip request: job picker shows job number only

When a mechanic requests a picking slip, the job list now shows only the job number, not the client name.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
