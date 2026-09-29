cd "C:\Projects\Apollo X Working"
git add -A
@"
Fix picking slip skipping stock at non-default bins, add RFQ resend, widen delivery note popup

- inventory/service.ts (createPickSlipForJob): fixed "No stock was
  available to pick right now" showing up even when the job's parts list
  clearly showed "In stock: N" (e.g. job BRE1116). Root cause: this only
  ever checked stock at a part's single default bin location
  (Part.binLocationId), while both the "In stock" figure on the job's
  parts list and the check that first marks a line IN_STOCK when it's
  added both sum a part's stock across EVERY bin location by design. A
  part with stock at a different bin -- or no default bin ever set --
  showed as in stock everywhere else but produced an empty pick slip here.
  Now checks every location the part actually has stock at (default bin
  first, to keep picking from its "home" bin when that's where the stock
  is), splitting the pick across more than one location if that's where
  it really sits. Also: an inactive part/location used to abort the WHOLE
  pick slip (every other line on the job too) instead of just skipping
  that one line -- fixed to skip, matching this function's own "pick
  what's there, backorder the rest" design.

- JobWorkspace.tsx: RFQ table's Retry/Send-email button now also appears
  on a SENT request, labeled "Resend" -- the backend already allowed
  resending anything short of QUOTED, the button just never offered it
  for a request that already sent successfully.

- JobWorkspace.tsx / globals.css: the Outwork "View delivery note" popup
  was fixed at 480px wide (shared with many small confirm/edit dialogs
  across the app) -- too narrow for its own Description/Quantity/Checked
  table, which wrapped badly. Widened just this one dialog to 720px via
  a new .delivery-note-dialog modifier class, same pattern already used
  for .job-editor-drawer -- every other popup using the shared style is
  untouched.

No schema change in this batch.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
