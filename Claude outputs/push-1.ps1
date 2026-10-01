cd "C:\Projects\Apollo X Working"
git add -A
@"
User/Mechanic RBAC lockdown, system-wide confirm dialog, editable delivery note

User/Mechanic role: visibility is now locked to Jobs/WIP, Job Kits,
Inventory (Stock Levels) and Suppliers (view + select for outwork)
only - every other nav item, including Dashboard, is hidden rather
than just disabled. New page-level guard (requireTenantPageAccess,
src/lib/auth/page-guard.ts) redirects instead of throwing, since the
app has no error.tsx boundary anywhere - an unauthorized page hit
would otherwise show Next's generic crash screen. Applied to every
(tenant) page that previously had no page-level check at all (only
some had API-layer checks), plus upgraded pex-stock/pex-tracking from
throw-based requireTenantPermission to the same redirect guard for a
consistent UX. AppShell's sidebar now filters by role permission in
addition to company module licensing (it previously only checked the
latter). Settings tabs, job header customer line/column, and Jobs/WIP
column picker all filter the same way.

Inside a job: the Customer details section and the Jobs/WIP table's
Customer column are hidden entirely from a Mechanic (not just
styled-away - getJobById now redacts job.customer server-side too
when the viewer lacks CUSTOMERS_VIEW). All fields are locked read-only
for a Mechanic except Notes, Parts List and Outwork, via a new
.unstyled-fieldset wrapper (all:unset + display:contents, so the
native <fieldset disabled> cascade locks every control inside without
disturbing the existing CSS grid layout). Per explicit confirmation,
this includes the job status stepper and the Warranty panel - both are
office/admin-only actions for this role, not editable by a Mechanic.
Enforced server-side too: updateJob silently drops any disallowed
field from a Mechanic's save payload rather than rejecting the whole
request outright (autosave always resends the full form, not a diff -
rejecting would have broken saving Notes itself), and
registerJob/changeJobStatus/closeJob/reopenJob/
markJobReturnedUnrepaired/upsertJobFieldService/upsertJobWarranty all
now reject a Mechanic outright via a new requireNotMechanicRestricted
guard.

Every window.confirm() in the app (12 call sites across JobWorkspace,
RfqAllWorkspace, PlatformModulesWorkspace, UsersWorkspace) has been
replaced with a new system-wide colored confirmation dialog
(ConfirmDialog.tsx / useConfirmDialog hook), built on the app's
existing .drawer-backdrop/.form-drawer popup convention, with
danger/warning/info tone variants (colored icon + accent, via
lucide-react's AlertTriangle/OctagonAlert/Info).

Print delivery note (job header "Print Delivery Note" button): the
description cell is now a prefilled, editable text input (same
pattern as the existing editable Qty field) instead of static text,
so a mechanic/admin can add or remove detail before printing. A new
Notes field (plain textarea, included in the print output) has been
added below the items table, above the Dispatched by/Received by
signature blocks.

src/lib/auth/permissions.ts, src/lib/auth/page-guard.ts (new),
src/app/api/v1/auth/login/route.ts, src/app/login/page.tsx,
src/app/(tenant)/customers/page.tsx,
src/app/(tenant)/storage-locations/page.tsx,
src/app/(tenant)/manufacturers/page.tsx,
src/app/(tenant)/settings/page.tsx,
src/app/(tenant)/settings/templates/page.tsx,
src/app/(tenant)/settings/dashboard/page.tsx,
src/app/(tenant)/settings/import-export/page.tsx,
src/app/(tenant)/users/page.tsx, src/app/(tenant)/support/page.tsx,
src/app/(tenant)/tax-codes/page.tsx,
src/app/(tenant)/commercial-terms/page.tsx,
src/app/(tenant)/numbering/page.tsx,
src/app/(tenant)/pex-stock/page.tsx,
src/app/(tenant)/pex-tracking/page.tsx,
src/app/(tenant)/dashboard/page.tsx,
src/components/DashboardWorkspace.tsx (new), src/lib/settings-nav.ts,
src/components/SettingsTabNav.tsx, src/components/AppShell.tsx,
src/lib/jobs/wip-columns.ts, src/lib/jobs/wip-columns-service.ts,
src/app/(tenant)/jobs/page.tsx, src/components/JobsWipColumnPicker.tsx,
src/components/JobWorkspace.tsx, src/lib/jobs/service.ts,
src/app/globals.css, src/components/ConfirmDialog.tsx (new),
src/components/RfqAllWorkspace.tsx,
src/components/PlatformModulesWorkspace.tsx,
src/components/UsersWorkspace.tsx.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
