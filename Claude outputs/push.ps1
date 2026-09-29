cd "C:\Projects\Apollo X Working"
git add -A
@"
Make picking slip delete permanent instead of soft-cancel

"deleted pickslips must delete completely from the system."

The Delete/Cancel action (Stock Levels' Picking Slip History and a
job's own pick slip list) previously restored the stock a slip took
but only flipped it to a Cancelled status -- the row stayed in both
lists forever, just greyed out. Now it genuinely deletes the PickSlip
row (cascades to its own PickSlipLine rows via that table's existing
ON DELETE CASCADE foreign key -- no migration needed), so a deleted
slip is simply gone from both lists, not lingering as a Cancelled
entry someone has to mentally filter past. The stock movement ledger
itself (the original pick and the new reversal) is untouched and
permanent, same as every other stock movement in the app -- only the
slip "receipt" record is removed. A permanent note that the deletion
happened still lives in the audit log, just not in either picking
slip list.

Both Delete/Cancel buttons now confirm() before acting, and are
simply always shown (no more Active/Cancelled status column in either
table -- every row left in the list is active by definition once a
deleted one is actually gone). Renamed the job page's own button
label from Cancel to Delete for consistency, since it's the same
irreversible action either place now.

src/lib/inventory/service.ts, src/components/StockLevelsWorkspace.tsx,
src/components/JobWorkspace.tsx.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
