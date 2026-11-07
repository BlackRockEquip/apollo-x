# Workshop track progress: 2026-11-07 Testing Reports module + Testing Technician user type

**Request:** "Build it. Create a new user type Testing Technician. Access granted to Admins, Managers, Testing Techs." Follow-up: "include the platform admin module to enable and disable."

## What was built
- **Module Testing Reports** (ModuleKey `TESTING_REPORTS`): transmission dyno test sheets from the approved mockup (8 boards, built on the three real CAT sheets: 777D, R1700G, 120K to 160K).
- **User type Testing Technician** (TenantRole `TESTING_TECHNICIAN`, Workshop build only).
- **Access:** Company Admins, Managers and Testing Technicians. Three permissions: `TESTING_VIEW` (see), `TESTING_EDIT` (start, fill in, complete, retest), `TESTING_MANAGE` (edit spec templates, reopen, delete draft). Admin and Manager get all three through their existing role sets; Testing Technician gets VIEW + EDIT only, no Jobs / customers / stock / dashboard / settings, lands on `/testing-reports` after login, and never sees customer names. Every other user type gets nothing.
- **Platform admin on/off:** the module is a tile (`TESTING_REPORTS`) in the Workshop build, so it appears on Platform > Companies > company > Industry build with an enable/disable box and licensing, like Pick slips or PEX. Off by default for new companies; Black Rock (internal) has it in full. Not offered to Engineering-build companies. A per-user module switch (Users screen) also works.

## Screens
- `/testing-reports`: list with search, All / In progress / Completed / Failed, progress and result pill; New test dialog (optional job lookup, template picker ranked by machine model).
- `/testing-reports/[id]`: test sheet with live pass / fail, autosave, Enter to next reading, pass-with-note (reason required, stamped with who/when), Complete / Retest / Reopen / Delete draft, Print.
- `/testing-reports/templates` (Admin / Manager): add starter templates, create/edit templates (parameters, clutch rows, limit types), switch off.
- Job screen: new **Testing** tab (Start test + the job's tests).
- Printed / PDF report in the redesigned layout with the company logo; customer is not printed.

## Design decisions
- Limits live as JSON on the template; a report copies the template spec when started, so later template edits never change old tests. Template revision goes up only when limits/layout/labels change.
- Result: any failing reading = Fail; all in and some passed by hand = Pass with note; else Pass. Completing needs every reading entered and a tester. Completed = read-only until a manager reopens.
- Templates are switched off, never deleted. Drafts can be deleted by Admin / Manager only.
- Technician has no Jobs access, so job lookup is its own endpoint (`/api/v1/testing-reports/jobs`), customer names only for users with CUSTOMERS_VIEW.
- Starter templates: 24 V supply and R1700G input flow are Record only (the sheets give no limit). R1700G "60 Less P1" is read as P2 at most P1 minus 60 (to be confirmed).

## Data
Migrations `20261107100000_testing_reports_enums` (ModuleKey + TenantRole values) and `20261107100100_testing_reports` (3 enums, `TestSpecTemplate`, `TestReport`). Run `npx prisma migrate deploy` + `npx prisma generate` (push script does).

## Tests
`tests/unit/testing-spec.test.ts` (limit maths, 777D sheet catches the 6th Reverse 390 vs min 392, R1700G pass with note, starter templates) and `tests/unit/testing-service.test.ts` (who gets access, role matrix, module off / licence grace, customer hidden for Technician, start / update / complete / retest, Testing tab, platform tile). 41 tests pass. Lint clean on new files. Type-check clean apart from the stale Prisma client in the sandbox (regenerates on the push script).

## Not in v1
Gear-by-clutch (P1/P2) chart print page, photo / attachment on a test, QC approval step, recording actual gear-chart values. Open question: confirm the R1700G "60 Less P1" rule.
