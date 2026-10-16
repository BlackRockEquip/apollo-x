cd "C:\Projects\Apollo X Working"
# Engineering build flow + Specifications dimensional size reports.
# Needs the previous push (ETA cards + Job kits) applied first.
# Run the database migrations afterwards with your usual process (prisma migrate deploy) - two new migrations.
git add -A
@'
Engineering build: job flow, wording, and Specifications dimensional size reports

- Engineering companies get their own job flow: To be received/collected, Await assessment, Quoting, Await go ahead,
  Await outwork, Work in progress, QC control, To be delivered, Delivered / Await payment, Complete / Close.
  Job types shown as Outright sale, Standard repair, Partial repair, Warranty repair. Workshop and Field service flows are unchanged.
- Job card: "Mechanic strip" becomes "Machinist 'Assess'" and "Mechanic assemble" becomes "Machinist 'Final'" for Engineering.
  Status wording follows the build on the stepper, status pill, job header, Jobs list, WIP bulk update and dashboard.
- Specifications module: "Dimensions recorded" table on the job (arrival and after machining), based on the Hi-Gear Dimensional Size Report.
  Part number, description, OD, ID, length, tolerance, additional measured, accepted Yes/No, per-table totals, copy parts from arrival,
  gauge/instrument and calibration reference, several reports per job, editable document-control block, printable A4 form.
  Machinists can record dimensions; changing the form details needs company settings access.
- Migrations: 20261016150000 adds the three job statuses (enum values); 20261016150100 adds the dimension report tables.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
