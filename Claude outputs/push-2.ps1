cd "C:\Projects\Apollo X Working"
git add -A
@"
Parts import revives a historical part instead of reporting "already
exists" when its own number matches

User report: after using "Delete all" on the parts catalog and
re-importing a cleaned-up sheet, every row said the part already
existed. Root cause: deletePart can't actually remove a part that's
ever had stock/job/kit activity - Postgres blocks the delete (onDelete:
Restrict on StockBalance/StockMovement/StockReservation/StockCountLine/
JobKitLine/JobPartLine) and it falls back to marking the part a
historical reference instead (active: false, operationalStatus:
HISTORICAL_REFERENCE). That keeps the row - and its unique part number -
in the database, just hidden from every list in the app (Parts Catalog,
Stock Levels), so there was no way to see it was still there.

importParts (import-export/service.ts) now tells the two cases apart: a
row matching an ACTIVE part's own number is still skipped as a genuine
duplicate, same as before; a row matching an INACTIVE/historical part's
own number instead REVIVES that same record - reactivates it
(active: true, operationalStatus: OPERATIONAL) and updates its fields
from the sheet via the normal updateMaster path, so its real stock/job
history stays attached to the same row under its new, clean number
rather than being orphaned behind a part nobody can see or edit. Only
the part's own number is treated this way; a number that collides with
some OTHER part's alternate/superseded/group number is still skipped
and reported (a real data collision, not a missing/hidden catalog
entry) - unchanged from before. Requires PARTS_EDIT on top of the
PARTS_CREATE already needed to import, checked once up front so a user
who can create but not edit parts fails the whole import cleanly instead
of partway through. Revived rows show as "updated" in the import summary
and row list, same status Jobs import already uses for its own
update-on-reimport rows; the admin/manager notification sent after an
import now mentions revived parts alongside created ones.

ImportExportWorkspace.tsx's Parts Catalog helper text updated to explain
both behaviors (separator stripping, revive-on-match) up front.

src/lib/import-export/service.ts, src/components/ImportExportWorkspace.tsx.

Note: this commit's "git add -A" will also pick up the previous batch
(Job Kits auto-create-missing-parts + strip-separators-at-input-time)
if that one hasn't been committed yet - both will land in one commit,
which is fine.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
