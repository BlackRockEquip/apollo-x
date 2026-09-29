cd "C:\Projects\Apollo X Working"
git add -A
@"
Picking slip no longer marks parts Received; fix reserve-part feature

Two related fixes, both from "check the reserve part feature if its
working correctly, i dont see that it reserves the part" and "when
clicking create picking slip inside a job, it should not change the
status to received as the part might not be in stock physically":

1. Create picking slip used to set a part line's status straight to
   RECEIVED/PARTIALLY_RECEIVED the moment stock was pulled from the
   shelf -- but pulling stock isn't the same as a person confirming the
   part is physically on the job. New PartLineStatus.PICKED (schema
   migration) plus a new JobPartLine.pickedQuantity field track "how
   much has been picked" completely separately from receivedQuantity,
   which now belongs entirely to the existing "Mark received" action --
   picking never touches it, so Mark received still works exactly as
   before once a part is actually in hand. Parts list shows a new
   "Picked X of Y" line and a distinct blue "Picked" status pill.

2. The automatic reservation made when a part is added to a job's parts
   list (or a job kit is applied) only ever tried to reserve stock at
   the part's single default bin location -- the exact same
   one-location-only mistake the picking slip's multi-bin fix caught
   earlier today. A part whose stock actually sits at a different bin,
   or has no default bin set, showed as "in stock" but silently reserved
   nothing at all, so Stock Levels' Reserved column never moved. Now
   reserves across every location the part actually has stock at,
   default bin first, splitting across more than one reservation if
   that's genuinely where the stock is -- fixed in both addPartLinesBulk
   (jobs/service.ts) and applyJobKitToJob (job-kits/service.ts).
   createPickSlipForJob's own reservation-consumption step was updated
   to match, so a reservation made at a non-default bin is still found
   and correctly consumed when the part is later picked.

Includes a schema migration (PartLineStatus.PICKED,
JobPartLine.pickedQuantity) -- Render's build command runs
`prisma migrate deploy` on every deploy, so pushing is enough, no
manual migration step needed.

prisma/schema.prisma, prisma/migrations/20260929130000_job_part_line_picked_status/,
src/lib/inventory/service.ts, src/lib/jobs/service.ts,
src/lib/job-kits/service.ts, src/components/JobWorkspace.tsx.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
