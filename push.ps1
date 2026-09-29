cd "C:\Projects\Apollo X Working"
git add -A
@"
Dashboard cleanup, filterable Outwork/RFQ tables, RFQ form fixes, stock-on-hand

- Dashboard: removed the "Inventory alerts" and "Low stock" cards -- both
  showed the exact same low-stock count under two different labels.
  Existing per-user saved dashboard layouts drop them automatically, no
  migration needed.

- Suppliers > Outwork and > RFQs: both tables now have a filter row under
  the column headers -- text filters for Job/Supplier/Description, a
  Status dropdown -- with a clear-filters button once any filter is
  active. Client-side, since neither list is server-paged.

- Request quote form (a job's RFQ popup): the "Add existing supplier"
  field now shows a browsable, scrollable list of suppliers as soon as
  you click into it, instead of only after typing 2+ characters.

- Fixed the real cause of the "Record quote" Save/Cancel buttons looking
  like they filled the whole column: a CSS rule only spanned a <label
  className="wide"> across the drawer's 2-column grid, not a plain
  <div className="wide"> -- so that panel's pricing table and its button
  row were both squeezed into a half-width column. Broadened the rule to
  cover any .wide element, which also fixes the same long-standing bug on
  a few other panels (parts follow-up, outwork items) that had the exact
  same issue.

- Job parts list: a part that resolves to an existing catalog part now
  shows "In stock: N" under it, summed from that part's stock balances
  across all bin locations.

- Dashboard background: set explicitly on <html> as well as <body>, so a
  short page on a tall screen can't reveal a plain white gap below the
  content instead of the app's light-grey canvas color.

Run against C:\Projects\Apollo X Working -- no new Prisma migration in
this batch, just app code and CSS.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
