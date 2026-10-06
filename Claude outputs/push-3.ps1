cd "C:\Projects\Apollo X Working"
git add -A
@'
PEX Tracking: sort by supply job number, highest to lowest

Numeric-aware sort on the supply job number (BRE1132 at the top, BRE001 at
the bottom) applied across the full result set before paging.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
