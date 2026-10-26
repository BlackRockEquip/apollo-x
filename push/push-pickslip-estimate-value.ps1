cd "C:\Projects\Apollo X Working"
# Stock Levels > Picking Slip History: new "Estimate Stock Price" column (company admins, managers, stock controllers only).
# No database change.
# Close the project files in your editor before running.
git add -A
@'
Picking Slip History: Estimate Stock Price column

- New column to the right of Lines: the estimated stock value of the parts picked on the slip (quantity picked x each part's cost price today; a part without a cost price counts as nothing). Cancelled slips show a dash.
- Only company admins, managers and stock controllers see it (and only if they may see cost prices); other roles see no column and the server sends no values.
- Tests: value maths, role gate, cost permission, cancelled slips.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
