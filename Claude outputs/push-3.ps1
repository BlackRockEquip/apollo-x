cd "C:\Projects\Apollo X Working"
git add -A
@'
Add Part: reuse a previously deleted part's number

Deleting a part with stock/job history only marks it historical, so its number
stayed taken and Add Part said "number already in use". Adding that number
again now revives the historical record (same as the Parts import).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
