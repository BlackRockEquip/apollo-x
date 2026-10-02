cd "C:\Projects\Apollo X Working"
git add -A
@"
Four quick fixes: Picking Slip History job link styling, redundant bin
location labels, part-number rename not propagating to open job
lines, and a Storage Locations bulk-delete button

Picking Slip History (StockLevelsWorkspace.tsx): the job number link
used .action-link, a fixed 28x28px square icon-button style built for
an icon-only link (like the "view part" link elsewhere on this same
page) - wrong shape for a multi-character job number, which read as
"a button hidden behind the text." Switched to a plain, unstyled Link,
matching every other job-number-as-link in the app (RfqAllWorkspace,
OutworkAllWorkspace, DashboardWorkspace, PexTrackingWorkspace).

Stock Levels bin location column (inventory/service.ts): every
binLocationLabel was built as "name (code)" unconditionally, so a
location whose name is just its own code (the default when
auto-created by import) showed as "C1 (C1)", "C6 (C6)". New
formatLocationLabel() helper omits the parenthetical when name and
code are the same (case/whitespace-insensitive) and now backs every
binLocationLabel in the file - Stock Levels, Part Detail, pick slip
lines, delivery notes - not just the one place reported, since they
all had the identical redundancy.

Part number edit (master-data/service.ts, inventory/parts-lookup.ts):
investigated "should change throughout the system even if used
elsewhere, not prevent the change." The rename itself was never
actually blocked by a part's usage - nothing but a genuine
already-in-use collision check runs, and every other table joins on
partId, not the number string, so a rename already shows up
immediately almost everywhere. Two real gaps found and fixed:
  1. JobPartLine stores its own partNumber as a plain column (a
     snapshot taken when the line was added, needed so a free-text
     line with no catalog match still has a number to show) - a line
     added before a rename kept showing the part's OLD number forever
     after. updateMaster now also updates every JobPartLine row linked
     to that part (partId match) when the number actually changes.
     PickSlipLine has the same kind of snapshot column, deliberately
     left alone - a picking slip is a frozen point-in-time record of
     what was issued under what number at the time, same as an
     already-issued invoice line not retroactively changing.
  2. numberAlreadyInUse's alternate-number collision check never
     excluded the part's OWN alternate numbers, so renaming a part's
     main number to equal one of its own existing alternate numbers
     collided with itself and threw "already in use" even though
     nothing else actually held that number. Now excluded, same as the
     main-number half of the same check already did.

Storage Locations bulk delete (master-data/service.ts, new
deleteAllMasterRecords; [kind]/route.ts's DELETE handler extended;
MasterDataWorkspace.tsx gained a toolbar "Delete all" button next to
the existing per-row delete, gated by the same config.deletable flag -
Manufacturers gets the same button for free, same as its existing
per-row delete already being shared with Storage Locations). Same
hard-delete-then-fallback-to-inactive behavior as a single row, across
every active record of the kind, with a "N deleted, M kept inactive"
summary - same pattern as the existing Parts "Delete all" on Stock
Levels.

src/components/StockLevelsWorkspace.tsx,
src/components/MasterDataWorkspace.tsx, src/lib/inventory/service.ts,
src/lib/inventory/parts-lookup.ts, src/lib/master-data/service.ts,
src/app/api/v1/master-data/[kind]/route.ts.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
