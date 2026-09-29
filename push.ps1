cd "C:\Projects\Apollo X Working"
git add -A
@"
Fix TS build error in createPickSlipForJob (wrong Prisma field name)

Render build failed: "src/lib/inventory/service.ts(1858,63): error TS2353:
Object literal may only specify known properties, and 'onHand' does not
exist in type 'StockBalanceWhereInput'." The new multi-location stock
query from the previous commit used the wrong field name in a raw Prisma
where filter -- the model field is quantityOnHand, not onHand (onHand is
only the local variable name lockBalance's own return type uses
elsewhere in this file). This sandbox has no local tsc/Prisma client to
catch this ahead of a real build -- esbuild only checks syntax, not
types, which is exactly how this slipped through. Fixed the one bad
field name; every other field in that block was manually cross-checked
against schema.prisma's real StockBalance/Part/StorageLocation models.

No schema change, no other files touched.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
