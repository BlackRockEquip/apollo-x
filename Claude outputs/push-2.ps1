cd "C:\Projects\Apollo X Working"
git add -A
@"
Job parts: ordered qty, and stock only leaves the shelf on Mark received

User requests: (1) "if I pick one part which qty is 2, 1 from stock and order
the outstanding at another supplier, how does one work?" and (2) "when
creating a pick slip it should not automatically take from stock already, it
should only take from stock when mark received is clicked."

Ordered qty
- New JobPartLine.orderedQuantity: how many of a line's units are being ordered
  from a supplier. Unset, a line with an order number/supplier counts as fully
  ordered (so a part ordered elsewhere is no longer listed on a pick slip);
  a line with neither counts as fully from stock.
- Parts table: a "Qty ordered" box under the Order # once a line has an order
  number or supplier, and a "From stock N - Ordered M" note on split lines.
- Changing it re-sizes the line's stock reservation (units ordered elsewhere
  stop being held back from other jobs) and trims the pick-slip count.
- Supplier follow-up now chases only the units meant to come from the supplier.

Pick slip no longer takes stock
- createPickSlipForJob only lists what to fetch and from which bin (quantity -
  ordered qty, less anything already taken). No stock movement, no balance
  change, no reservation consumed. "Picked X of Y" is now "On pick slip X of Y".
- Mark received takes the stock-sourced units off the shelf (reservation first,
  then other bins), recorded as ISSUE movements tagged with the part line.
  Source can be Auto (stock first), From stock or From supplier for a split
  line. Undo receive reverses those movements and re-reserves the stock.
- Deleting a pick slip made from now on has nothing to put back. Older job
  slips and Stock Levels slips, which did take stock, are still reversed.

Migration 20261005120000 adds orderedQuantity and stockIssuedQuantity, and
backfills stockIssuedQuantity from old pick slips so Mark received can't
deduct their stock a second time.

New: src/lib/jobs/part-line-quantities.ts (shared maths).
Changed: prisma/schema.prisma, jobs/service.ts, jobs/validation.ts,
jobs/parts-followup.ts, inventory/service.ts, components/JobWorkspace.tsx.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
