cd "C:\Projects\Apollo X Working"
# Dashboard values: completed jobs by status, Outstanding outwork, parts clock from Await outwork / parts, open tickets only, no scrapped PEX. No database change.
# Close the project files in your editor before running.
git add -A
@'
Dashboard values: completed by status, Outstanding outwork, open tickets, PEX without scrapped, parts clock from Await outwork / parts

- Completed this month and the "Jobs completed per month" line now count every job whose status is Complete or Closed (placed on its Delivery date; with no Delivery date it falls back to when it was closed / marked Complete). A reopened job no longer keeps counting.
- Parts outstanding: the days-outstanding clock (also used by "jobs overdue for parts" and the Parts > Outstanding tab) starts when the job reached Await outwork / parts or later, not when the part line was typed in during quoting.
- "Open procurement" is now "Outstanding outwork" and counts outwork still out with the supplier only (no RFQs), matching the Outwork screen it links to. It needs the Outwork module.
- Support tickets card and status bars count open tickets only (not Resolved or Closed); the card is now "Open support tickets".
- PEX units leave out Scrapped units as well as Completed ones.
- Upcoming / Overdue ETA cards no longer check closedAt, which is not cleared when a closed job is reopened and was hiding reopened jobs.
- Tests: tests/unit/dashboard-values.test.ts, parts-outstanding-since.test.ts, dashboard-support-scope.test.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
