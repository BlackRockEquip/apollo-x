cd "C:\Projects\Apollo X Working"
# Dashboard check: support ticket numbers follow the Support page's visibility; Recently updated jobs use the company's status wording. No database change.
# Close the project files in your editor before running.
git add -A
@'
Dashboard: support ticket numbers match what the user can see on the Support page; Engineering status wording on Recent jobs

- The Support tickets card and the "support tickets opened" chart line counted every ticket in the company for anyone with dashboard access. The Support page shows every ticket only to people who can manage users and just their own tickets to everyone else, so a manager could see "5" on the dashboard and one ticket on the page. The dashboard now uses the same rule.
- Recently updated jobs showed the standard status wording for Engineering companies (for example "Await outwork / parts") while the rest of the dashboard used the Engineering wording. It now uses the company's own wording.
- Tests: tests/unit/dashboard-support-scope.test.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
