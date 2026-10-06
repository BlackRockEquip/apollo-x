cd "C:\Projects\Apollo X Working"
git add -A
@'
Fix Jobs & WIP status filter from dashboard links

- A status and the WIP/Completed view were overwriting each other in the list query, so
  /jobs?view=wip&status=AWAITING_GO_AHEAD showed every WIP job. They now combine.
- Picking a status in the dropdown drops any WIP/Completed view; the view is shown as a
  clearable chip when active so the list never looks wider than its filters.
- Dashboard "Completed this month" opens the Completed view.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
