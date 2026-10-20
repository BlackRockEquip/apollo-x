cd "C:\Projects\Apollo X Working"
# Breakdown button/pill (NEW DATABASE MIGRATION: two columns on Job), Status column for WIP View, Machinist ETA on the Engineering dashboard.
# Close the project files in your editor before running.
git add -A
@'
Breakdown button and red pill on jobs; Status column for the WIP View user; Machinist ETA wording on the Engineering dashboard

- Job screen: a Breakdown button above the status stepper (right side) adds a red "Breakdown" pill beside the job's status; press Clear breakdown to remove it. The job keeps its place on the stepper. The pill also shows in the Jobs & WIP status column (and its filter). Not offered to Mechanics or the WIP View user. New columns Job.breakdown / Job.breakdownAt (migration 20261020120000_job_breakdown).
- WIP View user (Engineering): the table now also has the Status column.
- Engineering dashboard: the Upcoming/Overdue ETA cards say "Machinist ETA" instead of "Mechanic ETA".

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
