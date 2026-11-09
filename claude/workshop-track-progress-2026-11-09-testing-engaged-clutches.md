# Testing Reports: gears with a different number of engaged clutches (2026-11-09)

Approved mockup: boards 9 and 10 of the Testing Reports design.

## What it does
- New template layout **Engaged clutches per gear**. The clutches of the transmission are named once (C1 Forward, C2 Reverse, ...). Each gear then lists only the clutches engaged in it (1 to 12), each with its own limit (± tolerance, min, max, range, record only, N/A).
- **Test sheet:** one reading box per engaged clutch, live pass / fail, Enter moves along the gear then to the next gear, any clutch can be passed with a note.
- **Printed report:** the clutch table lists each gear with only its engaged clutches (spec window bar and the reading).
- Result, failure reasons ("3rd, C4: 325, maximum 310 (15 over)"), Pass based on comments and Pass with comment all work per clutch.
- Switching an existing template to the new layout turns Forward / Reverse (or P1 / P2) into two named clutches and keeps their limits.

## Data
- Template row: `clutchRows[].cells = [{ id, label, limit }]` (JSON, no new columns). Report readings: `clutches[gear].cells[clutchId] = { actual, note, override }`.
- One migration: `20261109100000_testing_layout_engaged` adds `ENGAGED` to the `TestLayout` enum. Existing templates and tests are not rewritten.

## Files
`src/lib/testing/{spec,validation,service}.ts`, `src/components/testing/{TestTemplatesWorkspace,TestReportSheet,printTestReport}` and `testing.css`, tests in `tests/unit/testing-spec.test.ts` and `testing-service.test.ts` (54 testing unit tests pass in the sandbox).

## Not included
No starter template for the engaged layout: set one up from Spec templates (copy an existing template, switch layout, add the clutches per gear).
