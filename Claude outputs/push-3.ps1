cd "C:\Projects\Apollo X Working"
git add -A
@'
Dashboard rebuilt: needs-attention strip, clickable status bars, stuck jobs, chart range

- Needs attention strip: jobs overdue for parts (7+ days), awaiting go-ahead (count +
  oldest days), jobs stuck 14+ days, ready to deliver. Each card links to the matching
  jobs.
- Jobs by status: bars open Jobs & WIP filtered to that status; red stuck flags per bar.
- Stuck in a status list (longest first), Parts outstanding list by job, Recently
  updated jobs with status pills, PEX and Support status cards.
- Activity chart: 3 / 6 / 12 month range switch. "Jobs summary" card is now
  "Completed this month" with a % change vs last month.
- Time in status is derived from the job activity log (no migration).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
