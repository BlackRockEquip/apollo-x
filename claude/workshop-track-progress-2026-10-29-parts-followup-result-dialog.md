# Parts follow-up: result dialog (2026-10-29)

User (screenshot of the Parts follow-up tab with a tiny "Barloworld: This supplier has no email address on file." line): the error is almost unnoticeable; open a small dialog confirming the follow-up succeeded or errored.

## What changed
- `JobWorkspace.tsx`: `sendPartsFollowup` now sets `followupDialog` instead of the inline text / page error. A small modal (same drawer-backdrop style as the other dialogs, icon + coloured title, OK button, closes on X or click outside) shows:
  - Follow-up sent: green, lists the suppliers emailed.
  - Follow-up partly sent: amber, lists Sent to / Not sent with the reason per supplier.
  - Follow-up not sent: red, reason per supplier (e.g. no email address on file, no supplier assigned).
  - Nothing to follow up: no outstanding ordered parts.
  - Follow-up failed: red, the error (including the email-not-set-up message, shown before anything is called).
- The old inline "Sent to / skipped" text block under the buttons is removed.
- `lib/jobs/followup-outcome.ts` builds the wording (pure); `tests/unit/followup-outcome.test.ts` 5 tests passing.

## Deploy
`push\push-parts-followup-result-dialog.ps1`, no migration, no API change.

## Notes
- Not rendered in a browser here.
