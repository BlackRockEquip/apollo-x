cd "C:\Projects\Apollo X Working"
# Pick slip lines now print in the same order as the Parts list. No database change.
# Close the project files in your editor before running.
git add -A
@'
Pick slip: lines follow the Parts list order

- The printed pick slip could list parts in a different order from the Parts list (e.g. part 2 at the bottom, part 4 at the top). The queries that build the slip had no sort order, so lines came back in whatever order the database stored them, which shifts once lines are updated.
- Creating a slip and the reserved-parts check now read the job's part lines oldest first (the Parts list order, with the line id as a tie-break); saved slips return their lines in the same order; the Parts list itself got the same tie-break.
- Tests: tests/unit/pick-slip-order.test.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
