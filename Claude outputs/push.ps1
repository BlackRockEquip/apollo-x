cd "C:\Projects\Apollo X Working"
git add -A
@"
Fix outwork delivery note dialog spacing/width; align parts follow-up list

Delivery note dialog (two follow-up reports on the widened dialog):

- "the table is still cramped not the width of the window" -- the
  table's wrapper div was missing the "wide" class, so inside
  .drawer-fields' 2-column grid it only ever got ONE column (about half
  the dialog's width), no matter how wide the dialog itself was made.
  Its own width:100% just filled that half-width box, and
  data-table-wrap's overflow-x:auto clipped the rest. Added "wide" so it
  spans the full dialog width like everything else in this drawer.

- "make the suppliers details more together, they are spaced very far
  apart" -- the supplier name/address/VAT/date lines were separate <p>
  "wide" elements, each its own row in the grid -- so on top of the
  grid's own 12px row-gap, every line also carried the browser's default
  paragraph margin (~1em top+bottom), which doesn't collapse between
  separate grid items the way it would in normal text flow, stacking up
  to 30-40px between lines. Replaced with a single "wide" block (one grid
  row) with the lines packed at a tight 3px gap like a real address
  block -- same "small-line as a <div>, no default margin" convention
  already used everywhere else in this app; this dialog was the one
  place still using <p>.

Consistency pass ("ensure this is the same throughout the app"):

- Audited every .drawer-fields (2-column grid) usage across the app for
  the same two bug patterns -- a data-table-wrap missing "wide", or
  stacked <p> elements as separate grid rows. Found one more genuine
  instance: the parts follow-up "skipped suppliers" list (job workspace,
  Parts screen) rendered one <p className="muted small-line"> per skipped
  supplier as siblings -- same margin-stacking issue. Converted to a
  tight-gap <div> block, matching the delivery note dialog's fix.
- Everything else checked (Stock levels, Import/Export, Platform users,
  Platform modules, Users/mechanics/sales reps, Job kits, Master data,
  RFQ/Outwork lists, and the "Record quote" drawer's own parts table)
  is either outside any .drawer-fields grid or already wrapped in "wide"
  -- no further changes needed there.

No schema change, JobWorkspace.tsx only.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
