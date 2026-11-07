# Workshop Track - progress 2026-11-06: Pick slip "picked / awaiting picking" status (pr41)

**Request:** "When pickslips are created in jobs and the parts picked, can a status next to pickslip show that the pickslip is picked or awaiting picking?"

## What changed
- Job > Generated pick slips and Stock Levels > Picking Slip History each get a **Status** column: Awaiting picking (amber), Partly picked (blue, with "n of m" lines when some lines are done), Picked (green).
- Nothing new is stored. Since 2026-10-05 a pick slip is only a list and stock comes off the shelf when each part is marked received (`stockIssuedQuantity`), so the status follows the parts: a slip line is picked when its part line has had its stock taken (or the line is fully Received, however it arrived). Awaiting = no line picked; Partly = some lines or part of a line; Picked = every line.
- A part line on several slips: the units taken off the shelf go to the oldest slip first (the server reads every live slip line on those part lines, so this is the same on every page).
- Slips whose stock was taken when they were made (Stock Levels' own picking, slips made before 2026-10-05 that carry a stock movement, lines with no part line) show Picked straight away.
- In the job, the slip list reads again by itself when a part line changes (Mark received / Undo), without flashing "Loading...".
- No migration, no new API: `GET /api/v1/inventory/pick-slips` items gain `pickState` (AWAITING / PARTLY / PICKED) and `pickedLines`.

## Files
New: `lib/inventory/pick-slip-state.ts`, `components/PickSlipStateBadge.tsx`, `tests/unit/pick-slip-state.test.ts` (9 tests; with pick-slip-order.test.ts 12 pass).
Changed: `lib/inventory/service.ts` (`listPickSlips`), `components/JobWorkspace.tsx`, `components/StockLevelsWorkspace.tsx`. Push: `push/push-pickslip-picked-status.ps1`.

## Notes / limits
- "Picked" means the parts were marked received on the Parts list, not a separate tick on the slip. If the storeman should confirm picking on the slip itself (a "Mark picked" button), that is a different, small build - not done.
- A line received from a supplier (source Order) while the slip lists it stays Awaiting until the line is fully received.
- Not run against a real database; list logic checked with mocked data.
