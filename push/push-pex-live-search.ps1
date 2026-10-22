cd "C:\Projects\Apollo X Working"
# PEX Stock (Stock + Scrapped jobs tabs) and PEX Tracking: the search box filters as you type. No database change.
# Close the project files in your editor before running.
git add -A
@'
PEX Stock and PEX Tracking: search as you type

- The search box on PEX Stock (both the Stock and Scrapped jobs tabs) and on PEX Tracking now filters the table as you type, with no Apply click and no page reload (same live search as Jobs & WIP).
- The page loads the whole list once and the search runs in the browser, so typing is instant. It searches the same fields as before: unit, job numbers, make/model (Stock, Scrapped) and unit, customer, supply/return job (Tracking).
- Only if a list is longer than one page load (200) does the search go back to the server.
- Apply still works for the status dropdown.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
