cd "C:\Projects\Apollo X Working"
# Reports job list + Print on every tab; WIP View ETA Overdue column + faster refresh; Engineering documents confirmation. No database change.
# Close the project files in your editor before running.
git add -A
@'
Reports: customer job list + Print on every tab; WIP View: ETA Overdue column and faster refresh; Engineering: documents confirmation

- Reports > per customer: new "All jobs" table listing every job for that customer in the selected period (job number opens the job), plus an "Export jobs CSV" button.
- Reports: a Print button above every tab (Overview, Jobs per customer, Warranty jobs, Monthly, Ratios and the customer view) prints that tab with the chosen period in the heading.
- WIP View user (Engineering): new last column "ETA Overdue" - the number of days past the Machinist ETA, "-" while not yet overdue (and once the job is at To be delivered or later). The page now refreshes every 10 seconds instead of 20.
- Engineering: moving a job to To be delivered or any later status (stepper, bulk Change status, Close job) first asks "Are all documents, specification sheets uploaded that are required?" with Confirmed and Cancel buttons.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
