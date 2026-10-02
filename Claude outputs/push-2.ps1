cd "C:\Projects\Apollo X Working"
git add -A
@"
Parts import: a re-used bin location code that had been "deleted" (kept
inactive, not removed, because it still has stock/movement history)
was permanently unmapped instead of being reactivated

User report: "when deleting parts from stock levels, the history is
not working when importing new parts and locations, bin locations do
not pickup, parts are skipped." Confirmed with the user: the previous
batch's fix (duplicate-row-per-location import + stale-balance
write-off on part revive) was already deployed; separately, Storage
Locations themselves had also been deleted before this re-import.

Root cause: deleting a Storage Location that still has stock/movement
history doesn't actually remove it - deleteMasterRecord falls back to
marking it inactive instead (same Restrict-fallback shape as
deletePart for Parts), which leaves its code permanently taken
(@@unique([companyId, codeNormalized]) isn't filtered by active).
importParts's own location lookup was filtered to active:true only, so
it could never see that location again - a sheet re-using the same bin
code found "no such location," and since "create missing locations"
then tried to create a fresh one under that same code, it collided
with the database's own unique constraint and failed. The row's bin
location note explained the failure, but every subsequent user-visible
symptom followed from there: with binLocationId left unresolved,
quantity couldn't be posted at all, and - because Prisma's update()
leaves a field alone when it's given undefined rather than clearing it
- a revived part's OLD bin location was never overwritten with the new
one, so it kept showing the stale location exactly like before last
session's fix. The same unresolved bin location also made the
multi-row-per-part fix from last session misreport a legitimate
"another location for this part" row as "skipped," since posting stock
was the only way that branch had of recognizing success.

Fix: importParts (and previewNewBinLocations) now look up Storage
Locations without the active filter. A bin code matching an inactive
location reactivates it (through a normal update, not a raw delete) -
the same "revive rather than recreate" approach the previous batch
already uses for a historical Part's own number - instead of trying to
create a colliding duplicate. previewNewBinLocations (the "which codes
are new" confirmation shown before import) no longer lists an inactive
existing code as new, since it'll be reactivated, not created. Needs
STORAGE_LOCATIONS_EDIT (on top of the module/permission checks already
in place), checked once up front whenever a bin location column is
mapped at all - independent of "create missing locations," since
reactivating an existing record is a different action from creating a
new one.

src/lib/import-export/service.ts.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
