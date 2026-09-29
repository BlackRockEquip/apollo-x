cd "C:\Projects\Apollo X Working"
git add -A
@"
Fix Compare quotes dialog: invisible entry table, cramped columns

Two follow-up reports on the new Compare quotes dialog (Render staging):

1. "does not show import quote or other suppliers requested from" -- the
   entry table (Import quote file / per-supplier price grid) never
   appeared at all, even though the read-only "Saved quotes" section
   below it rendered fine. A Ctrl+F page search for "Import quote file"
   still found it on the page, proving it WAS in the DOM, just rendered
   at zero height -- not a React/data bug.

   Root cause: every .form-drawer/.compact-dialog popup in this app
   (JobWorkspace.tsx's dialogs) is display:flex; flex-direction:column
   with a constrained max-height, and .data-table-wrap sits as a
   *direct* flex item inside several of them. Because .data-table-wrap
   sets overflow-x:auto (which forces overflow-y to compute as auto
   too), flexbox gives it an "automatic minimum size" of effectively
   zero -- so once a dialog's total content genuinely exceeds its
   max-height, as the new Compare quotes grid does with many parts times
   several suppliers, the flex-shrink algorithm is free to squash that
   one div toward 0px to make everything else fit, while sibling
   elements without overflow set on themselves (like the plain note
   paragraph, or the Saved quotes section's own wrapper div) don't get
   shrunk the same way. This was a latent bug in every .data-table-wrap
   in the app -- it just never surfaced before because no other dialog's
   content was ever tall enough to trigger the flex-shrink. Fixed by
   adding flex-shrink:0 to the shared .data-table-wrap rule -- a no-op
   outside a flex container, so safe everywhere, not just this dialog.

2. "space columns neatly not so far apart" -- the Saved quotes table had
   a large blank gap between the Part column and the supplier's
   Unit/Total columns, because the generic .data-table width:100% rule
   stretched a 3-4 column table across the dialog's new min(1200px,
   96vw) width (widened this session to fit many supplier columns) even
   when only one or two suppliers were actually on the job. Both
   .quote-comparison-table and .quote-entry-table now size to their own
   content (width:auto) instead of the dialog's width -- data-table-wrap's
   existing overflow-x:auto still lets them scroll horizontally once
   enough suppliers genuinely make a table wider than the dialog.

No schema change, globals.css only.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
