cd "C:\Projects\Apollo X Working"
# Job screen redesign, design A (header card, key facts, tabs, Parts tab). No migration.
git add -A
@'
Redesign the job screen (design A): header card, key facts, tabs and a tidier Parts tab

- Header: job number, status / Breakdown pills, customer, job type and machine in one card. Print is now a menu (Job card or Field report, Job history, Delivery note) and a More menu holds Mark / Undo returned unrepaired and Cancel job. Close job (or Reopen job) stays as a button. Autosave indicator and viewer avatars stay top right.
- The header and the status stepper stay fixed at the top, as before. The stepper shows "Step n of m" and the Breakdown button is now "Flag breakdown" / "Clear breakdown" in the same row.
- Key facts strip under the header: ETA with "in n days" / "n days overdue", quote and date, sales order, purchase order with its status, machine hours and parts received. Field service jobs show scheduled date, technician, site, machine, total hours and parts instead.
- Tabs replace the long single page: Overview, Parts list, Pick slips, Follow-up, Outwork, Specifications, Attachments, PEX, Warranty and Activity, with counts. Tabs only appear when they apply (same permissions and modules as before). The open tab is kept in the address (#tab=parts) so a refresh or a shared link opens the same tab. The tab bar stays pinned under the header while you scroll. Activity history now opens by default on its tab.
- Parts tab: filter chips (All, Outstanding, On pick slip, Received), an amber "n parts outstanding" line that links to Follow-up, coloured status pills, one outlined action per row (Mark received / Receive outstanding) with a menu for Undo receive and Remove part, and a summary line with the count per status.
- All job types get the new layout, including field service jobs. The create-job screen keeps its old header. The mechanic tablet layout follows separately.
- New files in src/components/job-screen; styles appended to globals.css (jw- classes, older rules untouched). Tests in tests/unit/job-screen.test.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
