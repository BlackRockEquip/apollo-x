cd "C:\Projects\Apollo X Working"
git add -A
@"
Remove customer-name search for Mechanics, bulk part delete, rework
Returned Unrepaired as a flag, fix quote import reading Total instead
of Unit Price

Jobs search (Mechanic only): the Jobs & WIP search box no longer
matches on customer name/trading name/account code for a Mechanic
(listJobs in jobs/service.ts) - same CUSTOMERS_VIEW permission gate
already used to hide the Customer columns and redact a job's customer
object for that role. customerReference/customerPo are untouched
(job-side reference numbers, not customer identity). The search
placeholder drops "customer" from its hint for the same audience.

Parts list bulk update: "Delete (N)" added alongside the existing
Apply/Mark received buttons in the bulk-update toolbar
(JobWorkspace.tsx) - deletes every selected part line in parallel via
the same endpoint each row's own Remove button uses, behind a
confirmation dialog since this one can't be undone.

Mark returned unrepaired: this used to overwrite the job's status with
a terminal RETURNED_UNREPAIRED value that skipped the rest of its
workflow. It's now an independent flag (new Job.returnedUnrepaired
column) layered alongside the job's real, still-progressing status -
the job keeps moving through its normal stepper. A "Return Unrepaired"
pill shows next to the status pill until the job reaches Completed, at
which point it folds into the status itself as "Completed /
Unrepaired" (same convention "Completed / Closed"/"Completed /
Cancelled" already use). The Jobs & WIP table's "Returned unrepaired"
filter chip now filters by this flag instead of by status, and the
Excel WIP auto-sync (excel-sync.ts) sets the same flag from matching
spreadsheet text instead of writing the old status value. The
RETURNED_UNREPAIRED JobStatus enum value itself stays defined (Postgres
can't drop an enum value in place) but nothing writes it anymore - the
new migration moves every job already sitting on it onto the flag and
back to Awaiting go ahead, the same status the old "Reopen" action
already sent these jobs to by hand.

Quote import pricing: importing a supplier's quote spreadsheet to
compare prices was reading a line-total column (e.g. "Total Price",
"Extended Price", or "Amount") as if it were a per-unit price whenever
that column's header happened to contain a word like "price" or
"cost" - the dedicated total-column handling (which divides back down
by quantity) never ran because the generic Unit/Price/Cost column
search matched first. Fixed in quote-extraction.ts: any header that
looks like a total-style column is now excluded from the generic
price-column search, so it's only ever picked up by the total-handling
path and divided back down to a unit price. "Amount" moved from the
generic price labels to the total-style labels to match standard quote
layouts (Qty / Unit Price / Amount, where Amount = Qty x Unit Price).

src/lib/jobs/service.ts, src/app/(tenant)/jobs/page.tsx,
src/components/JobWorkspace.tsx, src/app/globals.css,
src/lib/jobs/ui.ts, src/lib/jobs/validation.ts,
src/lib/jobs/excel-sync.ts, src/components/StatusPill.tsx,
src/lib/rfq/quote-extraction.ts, prisma/schema.prisma,
prisma/migrations/20261001160000_job_returned_unrepaired_flag/migration.sql.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
