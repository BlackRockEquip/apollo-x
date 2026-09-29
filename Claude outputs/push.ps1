cd "C:\Projects\Apollo X Working"
git add -A
@"
Move job status stepper inline with job header, merge To be
collected/received display

Job detail page header: added a status pill next to the job number
(new, uses the same StatusPill everywhere else already shows a job's
status), and moved the whole status stepper up from its own separate
"Job status" panel to sit directly under the header block instead -
customer name and job type stay stacked below the job number/pill
line, same as before. Dropped the old plain-text " - <status label>"
under the job type, since the new pill already carries that.

Status stepper: To be collected and To be received now render as one
combined stage on the stepper, labelled "To be received/collected" -
a job sitting on either status highlights on that same node (same
mechanism already used for Waiting for parts / Await outwork). This
is a display-only merge scoped to the stepper: the two statuses are
untouched everywhere else - a job actually registered as To be
collected keeps that literal status and label on its pill, the Jobs
list and every print, and the "Initial status"/"Reopen to status"
dropdowns still offer To be collected as its own choice, since those
read the underlying status list directly rather than the stepper's
own filtered view of it. No database change, no migration.

src/components/JobWorkspace.tsx, src/lib/jobs/ui.ts, src/app/globals.css.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
