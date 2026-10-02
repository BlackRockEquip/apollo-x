cd "C:\Projects\Apollo X Working"
git add -A
@"
Parts import: same part number on multiple rows (different bin
locations) no longer skips as a duplicate; reviving a historical part
now writes off its stale stock balance at the old location

User report 1: "when importing parts that have duplicate rows but
different locations, the import skips due to duplicate part." Cause:
importParts only ever checked a part number against the DATABASE
before creating it, so a sheet with the same part on several rows (one
per bin it already sits in) created the part on the first row, then
found that same just-created part on every later row and skipped it as
"already exists." Fixed by tracking part numbers created/revived
earlier in the SAME import run (a plain in-memory map, part number ->
part id, reset per import); a later row matching one of these posts its
quantity as additional opening stock at its own (possibly different)
bin location via the normal receiveStock path instead of touching the
part's other catalog fields again or being skipped. Cross-import
duplicates are unaffected - a number that already existed before this
import started is still checked against the database exactly as
before.

User report 2: "when all parts are deleted and reimported, it still
lists the old bin location, that must change to new location." Cause:
deleting a part with stock/job history doesn't actually remove it (see
the previous batch's revive-on-reimport fix) - it's deactivated instead,
and deactivating never clears its StockBalance rows. Stock Levels shows
every location with positive on-hand stock, so a revived part's old
location kept showing up alongside the new one this import posts to.
Fixed: when importParts revives a historical part, it now looks up
every stock balance still greater than zero for that part and writes
each one off with a real audited ADJUSTMENT_OUT movement (reason:
"Historical part revived by import - previous stock balance cleared"),
through the same adjustStock() path the Stock Levels adjustment screen
uses - not a silent raw reset - so the old quantity disappears from
Stock Levels but stays visible on the part's own movement history.
Requires INVENTORY_ADJUST on top of the PARTS_CREATE/PARTS_EDIT already
needed to import, checked once up front with the existing permission
checks so a user missing it fails the whole import cleanly instead of
partway through.

Both fixes land in the same per-row loop in importParts; the bin
location for a row is now resolved once, near the top of the loop
(moved up from its old spot just before building the create/update
payload), so both the new within-import duplicate branch and the
original create/revive path use the same resolved value instead of two
separate lookups.

src/lib/import-export/service.ts.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
