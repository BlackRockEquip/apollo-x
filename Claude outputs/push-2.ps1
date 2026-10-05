cd "C:\Projects\Apollo X Working"
# The Suppliers tab bar is no longer used by any page (Outwork and RFQs moved out)
if (Test-Path "src\components\SuppliersTabNav.tsx") { Remove-Item "src\components\SuppliersTabNav.tsx" }
git add -A
@"
Sidebar: Outwork and Parts (RFQs + Parts Outstanding) under Jobs; Parts Outstanding lists every unreceived part, plus Add Part to job

User request: move Outwork and RFQs out of the Suppliers tabs; Jobs menu order
Jobs & WIP, Job Kits, Parts, Outwork, PEX Stock, PEX Tracking; Parts has an RFQs
tab and a new Parts Outstanding tab (Job #, Supplier, Parts Outstanding,
Days Outstanding). Follow-ups: "All parts that are not mark received should be
listed", an "Add Part to job" button above the table, and "parts are only
outstanding once the job status changes to Await Outwork/Parts or higher".

- AppShell: Jobs group now Jobs & WIP, Job Kits, Parts (/parts), Outwork
  (/outwork), PEX Stock, PEX Tracking. Parts and Outwork are hidden for a
  Mechanic, same as when they sat under Suppliers.
- /outwork: the Outwork list (same page, same Jobs-module gating).
- /parts: RFQs tab (was a redirect to /inventory); /parts/outstanding: new
  Parts Outstanding tab with Job #/Supplier filters, GET /api/v1/parts-outstanding
  and lib/jobs/parts-outstanding.ts.
- Parts Outstanding lists EVERY part line not yet marked received (in stock, on a
  pick slip, on order, not ordered), one row per job + supplier; quantity is
  quantity - received. No supplier: "From stock" for in-stock/picked lines,
  otherwise "RFQ sent to <suppliers>" or "Not ordered yet". Days = since the oldest
  line in the row was ordered (or added).
- Parts only count as outstanding once the job's status is Await outwork / parts
  or later (Waiting for parts, Assembling, Testing, To paint / wrap, To be
  delivered, Delivered awaiting payment, Completed, Closed); a field service job
  counts from In progress onward; cancelled jobs and jobs flagged Return
  unrepaired never count. The RFQs table's own
  Parts outstanding column is unchanged.
- "Add Part to job" button above the table: pick a job, part number, quantity and
  optional description; added through the same endpoint the job's own parts box
  uses (POST /api/v1/jobs/[id]/parts), then the list refreshes.
- /suppliers is the Suppliers list only (tab bar removed, SuppliersTabNav
  deleted); /suppliers/outwork and /suppliers/rfq redirect to the new pages.
  Dashboard "Procurement / outwork" widget now links to /outwork.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
