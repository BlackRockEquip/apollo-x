cd "C:\Projects\Apollo X Working"
# PEX Tracking: smaller stats cards on one row, and only the table scrolls. No database change.
# Close the project files in your editor before running.
git add -A
@'
PEX Tracking: compact stats cards on one row; page no longer scrolls behind the heading

- The four stats cards (To be delivered, Outstanding at client, Received awaiting inspection, In repair) are now small and sit together on one row (two per row on narrow screens).
- With the cards taller than the table's scroll box assumed, the page scrolled as well as the table, so the list slid under the pinned PEX / PEX Tracking heading. The table box is now sized for this page's layout so only the table scrolls.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
