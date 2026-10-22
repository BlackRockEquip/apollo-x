cd "C:\Projects\Apollo X Working"
# Dashboard PEX tile counts the units in PEX Stock and opens PEX Stock. No database change.
# Close the project files in your editor before running.
git add -A
@'
Dashboard: PEX tile counts the units in PEX Stock and opens PEX Stock

- The PEX tile now shows the total units in PEX Stock (the same number as the PEX Stock page: back from a client, not redeployed, not scrapped) and opens PEX Stock instead of PEX Tracking. Label: "Units in PEX stock".
- The PEX panel lower down shows the same stock split into To be repaired / Ready to go, and links to PEX Stock.
- The widget (now "PEX stock" in Settings > Dashboard) needs the PEX Stock module and view permission, like the page it opens.
- "In PEX Stock" is defined once (lib/pex/stock-scope.ts) and used by both the PEX Stock page and the dashboard so they cannot drift apart.
- Tests: tests/unit/dashboard-values.test.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
