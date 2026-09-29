cd "C:\Projects\Apollo X Working"
git add -A
@"
Add Delete to Picking Slip History and a per-job pick slip list

"Picking slip history, add a delete slip button and allocate stock
back" plus "make viewing already created pickslips visible within the
job self."

1. Stock Levels' Picking Slip History table gets a Status column
   (Active/Cancelled) and, on any still-active row, a Delete button --
   reuses the cancelPickSlip action added earlier today (restores the
   stock the slip took, same as Job Workspace's own "Cancel" button),
   just labelled Delete here and gated behind the same manage
   permission as the rest of that tab. A cancelled slip's row stays in
   the list (as a record of what happened) but loses its Delete
   button -- it can still be reprinted.

2. A Job's own Parts screen now lists every picking slip ever created
   for that job -- date, line count, status, Print/Cancel per row --
   not just the ephemeral "just created" banner from this visit.
   Backed by a small extension to listPickSlips (a new jobId filter on
   GET /api/v1/inventory/pick-slips) rather than a new endpoint, so
   Stock Levels' own company-wide history and this job-scoped one share
   one code path. The existing single-slip "Cancel" button (from
   earlier today) and this list's own per-row Cancel button now share
   one generalized cancelJobPickSlip(id) handler instead of being
   wired to the one most-recently-created slip only.

No schema changes -- PickSlip.status/cancelledAt/cancelReason already
existed from today's earlier cancel-pick-slip work; this just surfaces
them in the two list views and wires a second entry point to the same
cancel action.

src/lib/inventory/service.ts, src/lib/inventory/validation.ts,
src/app/api/v1/inventory/pick-slips/route.ts,
src/components/StockLevelsWorkspace.tsx, src/components/JobWorkspace.tsx.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
