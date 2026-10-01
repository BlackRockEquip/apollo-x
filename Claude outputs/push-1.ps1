cd "C:\Projects\Apollo X Working"
git add -A
@"
Mechanic job-view section order, hide Picking Slip History + Suppliers
for Mechanics, reorganise generated pick slips, notify admins on
Mechanic parts-add

Job page (Mechanic only): Job details and Commercial & logistics swap
back to their original relative order (Machine -> Job details ->
Commercial), undoing the split introduced in the previous round. Both
role branches render identically now, so the role-conditional ternary
in JobWorkspace.tsx was simplified away to a single unconditional
render of machineSection/jobDetailsSection/commercialSection - the
only layout difference left for a Mechanic is Notes still claiming the
full row above instead of sharing one.

Stock Levels (Mechanic only): the Stock / Picking Slip History tab
switcher is now hidden entirely for Mechanics - they only ever see the
Stock tab (StockLevelsWorkspace.tsx), on top of the existing view-only
lockdown from the previous round.

Suppliers (Mechanic only): the Suppliers nav item is hidden from the
sidebar for Mechanics (AppShell.tsx, new hiddenForMechanic NavItem
flag), and all four Suppliers pages - the list, the Outwork tab, the
RFQ tab, and a supplier's own detail page - now redirect a Mechanic
away if they reach one directly by URL (new requireNotMechanicPage in
page-guard.ts). The SUPPLIERS_VIEW permission itself is left alone, on
purpose: it's what powers the supplier-name search inside a job's
Outwork section, which Mechanics still need. This is a role check
layered alongside the permission, not a permission change - a Mechanic
keeps SUPPLIERS_VIEW but the standalone Suppliers section is blocked
for them regardless.

Generated pick slips (all users): the picking-slip list inside a job
is no longer buried in the Parts list section's header - it's its own
"Generated pick slips" section now, moved to sit directly above Parts
follow-up, with its own header and the "Create picking slip" button
moved there instead of competing for space in Parts list's crowded
toolbar. Each row is now labelled "Pickslip N - <date>" (numbered from
the oldest slip) instead of showing only a bare date/time.

Notifications: when a Mechanic adds parts to a job (paste or file
import), Admins and Managers for that company now get a notification
("Parts added to job by Mechanic") linking to the job - same
notifyAdminsAndManagers helper the existing parts-import notification
already uses, just a second trigger for the Mechanic case
(jobs/service.ts). This adds one new NotificationType value
(JOB_PARTS_ADDED_BY_MECHANIC) to the Prisma schema with its own
migration - run your usual Prisma migrate step
(prisma/migrations/20261001150000_job_parts_added_by_mechanic_notification)
to apply it to the database; nothing else in this push needs a
migration.

src/components/JobWorkspace.tsx, src/components/StockLevelsWorkspace.tsx,
src/components/AppShell.tsx, src/lib/auth/page-guard.ts,
src/app/(tenant)/suppliers/page.tsx,
src/app/(tenant)/suppliers/outwork/page.tsx,
src/app/(tenant)/suppliers/rfq/page.tsx,
src/app/(tenant)/suppliers/[id]/page.tsx, src/lib/jobs/service.ts,
prisma/schema.prisma,
prisma/migrations/20261001150000_job_parts_added_by_mechanic_notification/migration.sql.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
