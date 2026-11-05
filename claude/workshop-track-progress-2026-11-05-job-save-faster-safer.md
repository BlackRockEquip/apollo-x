# Workshop Track - progress 2026-11-05: Job screen saving - faster and safe while typing (pr39)

**Request:** "the saving when in a job takes time or causes problems, e.g. when typing and moving to another field to type it doesn't save the next field correctly." Options 1-5 agreed ("do 1-5 now then we test first"). Built, tested in a harness, NOT pushed yet - to be tried by hand first.

## What was wrong (found in the code)
- Every autosave sent the whole form (45 fields), then re-downloaded the whole job and overwrote every field on the screen with the server's copy. Typing done while that save/reload was in flight got replaced by older values.
- Saves were not queued (could overlap / finish out of order).
- A "skip the echo" flag (skipNextAutosave) stayed set when a reload changed no values, so the FIRST edit after a save was never saved until another edit followed.
- Each save did a heavy job lookup (customer, branches, contacts, addresses) plus a component upsert, all four PEX syncs and a full reload.

## What changed
1. Reload never overwrites typing: the screen keeps `baselineRef` (what the server last confirmed); a reload keeps any field that differs from it. A reload that started before a save was confirmed (or lands mid-save) is dropped and retried when saving is quiet. Values that differ only by end spaces are left alone (the server trims).
2. Changes-only saves: PATCH sends only the fields that differ from the baseline (e.g. `{"machineSerial":"SN-1"}` instead of 45 fields), so two people editing different fields no longer overwrite each other.
3. One save at a time: a request during a save becomes exactly one follow-up (`createSerialRunner`).
4. Lighter server save (`updateJob`): small select instead of getJobScoped; component record only touched when a component field is in the save; each PEX sync only when a field it reads is in the save (type/component/componentType/deliveryDate -> create PEX record; previousJobNumber -> redeployment; deliveryDate/type -> await-core; component/componentType -> unit description). The client updates its copy from the save's response and reloads the full job in a quiet moment (about 2.5 s after the last save, 0.3 s when customer / mechanic / sales rep / type changed).
5. Save on leaving: leaving a field saves straight away (no wait for the typing pause); switching tab saves; leaving the page / closing the tab sends the pending change with keepalive. Typing pause is now 1.0 s (was 1.2 s).

## Tested
- 11 new unit tests for the helpers (`tests/unit/job-autosave.test.ts`) and 4 for the server save (`tests/unit/job-save-lean.test.ts`); related suites pass.
- Real job screen run in a browser against a slow fake server (save 1.5 s, reload 1.2 s), old vs new: typing in rounds across saves - old LOST "MNOPQRSTUVWX" from a 36-character entry, new kept all; first edit after a save - old never saved it, new did; leaving the page straight after typing - old lost it, new saved it once; leaving a field - new starts the save immediately; failed save - both show "Save failed - retrying" then recover.

## Files
New: `lib/jobs/job-autosave.ts`, the two test files. Changed: `components/JobWorkspace.tsx`, `lib/jobs/service.ts`. Push (after testing): `push/push-job-save-faster-safer.ps1`. No migration.

## Notes / limits
- Not run against a real database. The "Job details updated" history entry is still written on every save (now listing only the changed fields); one entry per typing pause - could be merged later.
- Field-service report fields keep their own separate autosave (unchanged).
- Option 6 (per-field Saved / Failed status) and 7 (edit-conflict warning) not built.
