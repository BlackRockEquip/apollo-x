# Workshop Track - progress 2026-11-06: Jobs & WIP Board view (pr40)

**Request:** "Looking at the job wip table page, would you recommend a different view? Mockup if so." Recommended keeping the table and adding a Board view beside it. Mockup: Design canvas "Jobs & WIP view options" (note `claude/jobs-wip-board-view-mockup-2026-11-06.md`). User answers: "Build it. Table should be default view. Drag to move later yes. Happy with the new lanes."

## What changed
- New **Table | Board** switch beside the search box. Table is the default; the choice is remembered per browser in a cookie (`apollox.jobsLayout`), read by the server page so there is no flash.
- Board = the same jobs as cards in lanes: Receiving, Quote and approval, Workshop, Parts and outwork, Delivery (Field service / Completed / Other lanes only appear when a job is in them). "Every status" splits into one lane per status of the company's flow (Engineering uses its own list and wording).
- Card: job # (or draft #), job type, customer (only for users with CUSTOMERS_VIEW, same as the Customer column), component and machine, status pill, Breakdown / Return unrepaired / Pex pills, "N items" and "Items at different steps" for multi-item jobs, machinist/mechanic initials (+N), ETA. Past the Mechanic/Machinist ETA (same rule as the ETA Overdue column and dashboard) shows a red "ETA 02 Nov · 4d late" chip. A job with only a customer ETA shows it but is never marked late from it.
- Order in a lane: most late first, then nearest ETA, no ETA last, then newest number. Each lane shows 8 cards, "Show N more" for the rest.
- Board filters: Late only (n), Mechanic/Machinist, Job type, Show completed (completed hidden by default), and the lane style. Lane style and Show completed are kept in a cookie (`apollox.jobsBoardPrefs`); the others reset on reload.
- The page search box, header filters and dashboard links (?status=...) still drive the board: the table stays in the page (hidden while the board shows) and the board shows only the jobs whose table row is not hidden. Auto refresh keeps working. Columns / Items / Print / Email buttons are table-only and hide while the board shows.
- View-only (WIP_VIEWER) users see the board; cards do not open the job.
- No migration, no API change.

## Files
New: `lib/jobs/wip-board.ts`, `components/JobsWipBoard.tsx`, `components/JobsWipLayoutSwitch.tsx`, `components/jobs-board.css` (imported by the board component, not added to globals.css), `tests/unit/jobs-wip-board.test.ts` (20 tests pass).
Changed: `app/(tenant)/jobs/page.tsx` (cookie read, cards built from the loaded jobs, `data-layout`, `data-row-id` on every row, table-only wrappers). Push: `push/push-jobs-wip-board-view.ps1`.

## Notes / limits
- Drag a card to another lane to change status: agreed as a later step, not built (needs the same status rules as the bulk status change).
- The Status header filter is not on screen while the board shows; a dashboard link or an existing filter still applies and the "X of Y jobs shown / Clear filters" line stays visible.
- Checked in a browser harness (lanes, late chips, flags, filters following hidden table rows, switch and cookies, Every status). Not run against the real database / full page.
- 2026-10-05 the user removed the status chip strip under the search box; the board lanes are separate from that (user confirmed they are happy with the lanes).
