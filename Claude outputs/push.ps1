cd "C:\Projects\Apollo X Working"
git add -A
@"
Fix picking slip: include IN_STOCK lines in pick eligibility (BRE1116)

Follow-up to the multi-bin pick fix — BRE1116 was still failing with "No
stock was available to pick right now" after that landed. The real
second root cause: createPickSlipForJob's eligibility filter never
included the IN_STOCK status at all, only PENDING/ON_ORDER/
PARTIALLY_RECEIVED.

addPartLinesBulk sets a new job part line to IN_STOCK (not PENDING)
whenever the part's on-hand stock already covers the requested quantity
at add-time, but it never sets receivedQuantity — so an IN_STOCK line is
just as un-picked as a PENDING one. Any job whose parts already showed
the "In Stock" badge had those lines silently skipped before the
multi-bin lookup ever got a chance to run, regardless of how good that
lookup is.

One-line filter fix: add "IN_STOCK" to the status array. No other
change needed — the existing remaining-quantity math already handles a
line with receivedQuantity of 0 correctly.

src/lib/inventory/service.ts only.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
