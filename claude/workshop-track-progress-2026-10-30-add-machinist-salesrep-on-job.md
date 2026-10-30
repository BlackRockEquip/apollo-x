# Workshop Track progress — 2026-10-30 — Add a machinist / sales rep from the job screen

**Request:** make it so a machinist or sales rep typed on a job that is not in the dropdown can be added.

## What changed
- `src/components/NamedPicker.tsx` (new): type-ahead over a short named list (same look as the Machine make box). Shows the "nothing" row, matches, and **Add "<name>" as a new name** when the typed text (>= 2 letters) is not already listed. Keyboard: arrows, Enter (picks an exact match or the highlighted row), Escape. Shows the server's message under the box if adding fails.
- Used for Machinist 'Assess' / 'Final' and Sales representative (job screen + New Job), and for the per-item machinists (Reassign machinist, Edit item, New Job item rows) via `onCreateMechanic`. `JobWorkspace.createStaffOption` posts the name, adds it to the lists in state and selects it.
- Server: `addMechanicOption` / `addSalesRepresentativeOption` in `lib/jobs/service.ts` (+ `staffNameInput` in `validation.ts`); `POST /api/v1/jobs/mechanics` and `/sales-representatives`. Allowed with JOBS_EDIT or JOBS_CREATE, not for the restricted Mechanic role; same-origin check; audit events. A name that exists (case-insensitive) is reused; an inactive one is switched back on.
- Tests `tests/unit/named-picker.test.ts`; 68 pass with the item-machinist and job-items suites. Rendered in Chrome: list, add (name appears and is selected), error message, Enter on an exact name.

## Notes
- The name is added to the company list as soon as it is chosen (even on an unsaved New Job); it can be removed under Settings > Users > User Setup.
- No migration. Push: `push\push-add-machinist-salesrep-on-job.ps1`.
