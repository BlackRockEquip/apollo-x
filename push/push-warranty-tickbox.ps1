cd "C:\Projects\Apollo X Working"
# Warranty becomes a tickbox on a job instead of a job type. NEW MIGRATION (1): adds Job.isWarranty and moves old Warranty-type jobs over.
npx prisma migrate deploy
npx prisma generate
git add -A
@'
Warranty is now a tickbox on a job, not a job type

- New "Is warranty" tickbox under Job type on the New job form and on the job screen, so a warranty job can be a workshop repair or a field service job. It is offered for Standard repair, Partial repair and Field service, and hidden for PEX supply, PEX return and Outright sale (changing to one of those clears it).
- Ticking it adds the Warranty tab and a "Warranty - Pending / Granted / Declined" pill in the job header. Unticking removes both. The job type keeps deciding the status flow and the job card, so a field warranty job stays a field job.
- The Warranty tab holds the same panel as before (status, historical source status, notes). A new warranty job starts with a Pending claim.
- Warranty is no longer offered in the Job type list. An old client or import that still sends the Warranty type is saved as Standard repair with the tickbox on.
- Existing jobs saved as type Warranty are moved to Standard repair with the tickbox on (status, notes and history kept). Change any that were really site callouts to Field service on the job.
- Reports (Warranty jobs, ratios, monthly), the dashboard "Warranty jobs per month" graph and the customer page count now read the tickbox.
- Ticking and unticking is written to the job's activity history.
- Migration 20261111100000_job_is_warranty (one column, one data move).
- Tests for the rules, the API, the autosave and the tab.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
