cd "C:\Projects\Apollo X Working"
git add -A
@"
Stock Levels: Stock Take tab (Admin / Store Controller only) and
per-column filters for Manufacturer / Bin location

Stock Take: new tab on Stock Levels, visible only to whoever holds
INVENTORY_RECONCILE (COMPANY_ADMIN and STORE_CONTROLLER by default,
same as every other role gate in this app, rather than a hardcoded
role check - a company can extend it to another role later from
Settings > Users and this tab follows automatically).

Flow (confirmed earlier): pick a bin location, get a printable sheet
(part number, description, system quantity, and a blank column to
write the actual count, with a sign-off block at the bottom), count
by hand, then come back and key in what was actually counted. On
submit it computes the variance per part and posts a real stock
adjustment for anything that doesn't match, through the
StockCount/StockCountLine reconciliation backend that already existed
in inventory/service.ts (countCreate/countComplete) but had no UI
anywhere - this tab is the first thing that actually uses it. A
History sub-tab lists every count with its status (Open / Completed /
Approved / Cancelled); a Completed count can be approved, an Open one
(nothing posted to stock yet) can be cancelled.

countApprove and countCancel also already existed as backend
functions but, unlike countCreate/countComplete, had no API route at
all - added src/app/api/v1/inventory/counts/[id]/approve/route.ts and
.../cancel/route.ts (same POST-only shape as the existing complete
route) so the tab's Approve/Cancel buttons have something to call.

The request's second bullet ("add/adjust/delete bin location
quantities, parts in bin, values etc") is covered by Stock Levels'
existing Adjust-stock action and Storage Locations' existing add/
edit/delete screens - this tab is specifically the print-count-
reconcile workflow, not a second way to hand-edit a balance.

Per-column filters: added a filter row under the Stock table's header
(same convention already used on the Suppliers RFQ/Outwork tables) -
dropdowns for Manufacturer and Bin locations, the two columns that
actually have a finite, dropdown-shaped set of values. Turned out the
backend (listInventoryPositions, positionQuery) already accepted
manufacturerId/locationId filters - nothing in the UI ever set them,
so this was purely a frontend wiring gap, no backend changes needed.
Part/Description are left to the existing search box (which already
matches both, plus bin code/name and manufacturer name, in one field);
Cost Price/Selling Price/On Hand/Reserved/Available have no natural
dropdown domain; State already has its own filter (the radio buttons
above the table) and was left as-is.

New: src/app/api/v1/inventory/counts/[id]/approve/route.ts,
src/app/api/v1/inventory/counts/[id]/cancel/route.ts. Changed:
src/components/StockLevelsWorkspace.tsx (Stock Take tab, print sheet,
counted-quantity entry form, history list, and the new filter row).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
