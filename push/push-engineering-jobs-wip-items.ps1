cd "C:\Projects\Apollo X Working"
# Engineering: Jobs & WIP list opens a multi-item job into its items like the list mockup. No migration.
git add -A
@'
Engineering: Jobs & WIP rows expand to show the items of a multi-item job

A job with more than one item now has a chevron before its job number. Clicking it opens the items under the row: item tag, component with model and serial, status pill, machine and ETA (late items in red with the days late). A "Show all items" / "Hide items" button next to the job count opens or closes every job at once. What is open is remembered for the browser tab, so going into a job and coming back leaves the list as it was. The Status column keeps the mixed-status bar.

Search finds a job by the components, models, serials, part numbers and machines of its items. The item rows are skipped by the column filters, Print and Email (they stay one row per job), are hidden with their job when a filter hides it, and are not printed. The list query now returns the fields of each item for this.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
