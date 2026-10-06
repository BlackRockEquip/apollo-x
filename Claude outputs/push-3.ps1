cd "C:\Projects\Apollo X Working"
git add -A
@'
Quote import matches part numbers ignoring hyphens; job view layout tweaks

- Compare-quotes import: 3J-1907 in a quote now matches 3J1907 (text and
  spreadsheet quotes).
- Job view: Attachments and Send to PEX Inventory side by side; PEX buttons
  use the standard section button style.
- Footer buttons get top padding so they no longer sit on the divider line.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
