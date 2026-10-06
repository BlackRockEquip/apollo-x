cd "C:\Projects\Apollo X Working"
git add -A
@'
PEX history everywhere now shows previous jobs only

PEX Supply and PEX Return panels (job page), PEX Tracking and PEX Stock all
show a Previous jobs table: job number, supply/return, date delivered,
status, PO number. Shared PexPreviousJobsTable component.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
