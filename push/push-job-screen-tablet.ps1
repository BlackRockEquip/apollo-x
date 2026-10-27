cd "C:\Projects\Apollo X Working"
# Job screen design C: mechanic tablet layout. No migration.
git add -A
@'
Job screen design C: tablet layout for the Mechanic role

- Mechanics (the User role) now get a tablet-friendly job screen. Everyone else keeps the new tabbed screen. The view-only role keeps the tabbed screen too.
- Fixed top: back button, job number, machine and job type, status and Breakdown pills, autosave. Under it a read-only status track (Step n of m, locked, managed by the office team) that scrolls to the current step.
- "This job" summary on the left with machine, serials, plant number, machine hours and the job description. No customer details. The latest note is shown and opens the Notes popup when tapped.
- Parts are cards, filtered by All / To receive / On pick slip / Received, with a search button. Each card has a large button: Mark received, Receive n more, Undo receive, or Choose supplier.
- Mark received opens a popup with a big quantity stepper (and Stock first / From stock / From supplier when it applies). Tapping a card opens its details: order number, quantity ordered, supplier search, a note, and Remove part. These use the same saving as the old table.
- Bottom bar: Add parts, Pick slips, Photos, Notes and Outwork (only the ones the mechanic has access to), plus "n parts outstanding" and "x of y received". Each opens in a large popup using the existing sections.
- Everything the mechanic could do before is still there; nothing new is allowed. Server rules are unchanged.
- New files in src/components/job-screen (tablet-model.ts, TabletSheet, TabletStatusTrack, TabletPartCard, QtyStepper); styles appended to globals.css (jt- classes). Tests in tests/unit/job-screen-tablet.test.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
