cd "C:\Projects\Apollo X Working"
# Fix: the "Is warranty" tickbox was invisible on field service jobs. No migration.
git add -A
@'
Fix the Is warranty tickbox not showing on field service jobs

- On field service jobs the tickbox was squeezed to nothing (only the words "Is warranty" showed), so it could not be ticked. It now has its own row under Job type and Previous job number and keeps its size.
- Workshop jobs are unchanged apart from the tickbox keeping its size.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
