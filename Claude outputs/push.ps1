cd "C:\Projects\Apollo X Working"
git add -A
@"
Add cancel picking slip action for job-scoped picks

"in a job, when creating a picking slip, need a way to cancel picking
slip if a error was made."

New PickSlip.status (ACTIVE/CANCELLED, schema migration), plus
cancelledAt/cancelledById/cancelReason audit fields, and three new
PickSlipLine columns (jobPartLineId, previousStatus, stockMovementId)
so a cancel can precisely reverse each line without guessing:

- Restores the stock the line took, via a new UNPICK stock movement
  (StockMovementType already reserved this value, unused until now)
  linked back to the original ISSUE via reversalOfId.
- Rolls the linked JobPartLine's pickedQuantity back by this slip's
  share, and once that reaches zero restores the status the line had
  right before THIS specific pick (PickSlipLine.previousStatus -- kept
  separate from JobPartLine.previousStatus, which stays reserved for
  the unrelated "Mark received" undo flow).
- A line already marked Received since the pick (status has moved on
  from PICKED) has its stock restored but its status/pickedQuantity
  left alone -- silently un-receiving a person's own confirmation
  would be a bigger surprise than a little stale pickedQuantity. The
  response's skippedLines count surfaces this rather than staying
  silent.
- A PickSlipLine from before this migration, or from Stock Levels' own
  separate createPickSlip path, simply has no jobPartLineId -- stock
  is still restored, there's just no job line to roll back.

New cancelPickSlip service function (inventory/service.ts) and POST
/api/v1/inventory/pick-slips/[id]/cancel route. JobWorkspace's picking
slip result banner gets a "Cancel" button next to the existing Print
button.

Known simplification, documented in code: no reservation is recreated
on cancel (the part goes back to needing a fresh reserve/pick like any
other outstanding line). Also documented: fully cancelling several
layered pick slips against the same line, in the wrong order, can
leave it stuck at status PICKED with pickedQuantity 0 instead of its
true original status -- a rare edge case, not solved with a full
undo-history stack.

Includes a schema migration (PickSlipStatus, PickSlip/PickSlipLine
columns) -- Render's build command runs ``prisma migrate deploy`` on
every deploy, so pushing is enough, no manual migration step needed.

prisma/schema.prisma, prisma/migrations/20260929140000_pick_slip_cancel/,
src/lib/inventory/service.ts, src/lib/inventory/validation.ts,
src/app/api/v1/inventory/pick-slips/[id]/cancel/route.ts,
src/components/JobWorkspace.tsx.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
