cd "C:\Projects\Apollo X Working"
# PEX Stock: same compact stats cards and table box as PEX Tracking. No database change.
# Close the project files in your editor before running.
git add -A
@'
PEX Stock: same compact stats cards and table as PEX Tracking

- PEX Stock's three stats cards (Total units in inventory, To be repaired, Ready to go) are now the same small one-row cards as PEX Tracking.
- The Stock and Scrapped jobs tables use the same sized scroll box as PEX Tracking, so only the table scrolls and the page no longer scrolls behind the heading.
- Shared styles renamed: .pex-panel (was .pex-tracking-panel) and .pex-stat-row now fits however many cards a page has.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
