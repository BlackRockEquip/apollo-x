cd "C:\Projects\Apollo X Working"
git add -A
@"
Mechanic-only job layout reorder, Stock Levels locked to view-only for Mechanics

Job page layout: the earlier reorder (Notes full-width, with Machine/
component details and Commercial & logistics sharing the row below it)
turned out to be wanted for the User/Mechanic role only, not every
role's layout. Machine/component details, Commercial & logistics and
Job details are now each pulled into their own variable
(machineSection/commercialSection/jobDetailsSection in
JobWorkspace.tsx) and rendered in a different order depending on
tenantRole: a Mechanic gets Machine -> Commercial -> Job details under
a full-row Notes panel; every other role keeps the original Machine ->
Job details -> Commercial order with Notes back to its normal
half-width panel. Same underlying field markup either way, nothing
duplicated.

Stock Levels (Inventory): a Mechanic can now only check what's in
stock - Edit, Delete, Delete all, Add or Import Part, Adjust, Create
picking slip and Delete picking slip are all hidden for that role
(StockLevelsWorkspace.tsx), while part detail pages, bin/location
figures, pricing (where already visible) and the Check stock search
all stay visible. This was already safe server-side (a Mechanic never
held the PARTS_CREATE/PARTS_EDIT/PARTS_DEACTIVATE/INVENTORY_ADJUST
permissions these actions need), but the buttons themselves were
showing regardless of role - including an Adjust button that would
have failed with a server error if a Mechanic clicked it, now fixed
for every role, not just Mechanics. The inventory page also picked up
the same requireTenantPageAccess guard every other (tenant) page
already has, for consistency (it was missed in the original sweep
since every role that could reach it already held INVENTORY_VIEW).

Also fixed: three plain confirm(...) popups (Stock Levels' own delete-
picking-slip action, Stock Levels' delete part / delete all parts, and
the job page's own cancel-picking-slip action) that the earlier
system-wide colored confirm dialog conversion missed, because that
sweep searched specifically for window.confirm(...) and these used the
bare global confirm(...) instead. All three now go through the same
useConfirmDialog/ConfirmDialog.tsx dialog as everywhere else.

src/components/JobWorkspace.tsx, src/components/StockLevelsWorkspace.tsx,
src/app/(tenant)/inventory/page.tsx.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
