# Testing Reports: "Pass with comment" status (2026-11-09)

## What changed
- A test the tester passes with **Pass based on comments** now reads **Pass with comment** instead of "Pass with note". It shows in the reports list, the job's Testing card, the test sheet (pill, banner, confirm text) and the printed report (result tile and footer).
- Tests passed one reading at a time with a note still read **Pass with note**.
- Stored result is unchanged (`PASS_WITH_NOTE` with `resultSummary.passedOnComments`), so no migration and old reports are labelled correctly.
- The list API now returns `passedOnComments` for each report.

## Files
`src/lib/testing/spec.ts` (new `resultLabel`), `service.ts`, `src/components/testing/{types,ResultPill,TestingReportsWorkspace,JobTestingCard,TestReportSheet,printTestReport}`, `tests/unit/testing-service.test.ts`.

## Tests
47 testing unit tests pass in the sandbox.

## Next (mockup approved first)
Gears with different numbers of engaged clutches: boards 9 and 10 of the Testing Reports design. Awaiting "Build it".
