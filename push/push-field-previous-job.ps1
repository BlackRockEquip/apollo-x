cd "C:\Projects\Apollo X Working"
# Field service jobs get the Previous job number field. No migration.
git add -A
@'
Field service jobs: add the Previous job number field

- The Previous job number field is now on field service jobs, on the New job form and in Work requested on the job screen. It was only on workshop jobs before.
- Same field and same saving as the workshop one (including the PEX redeployment note), so nothing else changes.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
