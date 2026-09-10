// 2026-09-10 — user report: "I am company administrator but I do not have
// access to company branding, this needs to change."
//
// Root cause (traced via src/lib/auth/guards.ts, permissions.ts, session.ts):
// requireTenantPermission() checks ctx.tenantPermissions, which is built in
// resolveSessionToken() as:
//   mergePermissionOverrides(DEFAULT_TENANT_PERMISSIONS[membership.role], membership.permissions)
// COMPANY_ADMIN's default is ALL_TENANT (every TenantPermission, including
// COMPANY_SETTINGS_VIEW/EDIT and USERS_MANAGE) — so a Company Administrator
// should never be denied here unless this specific membership has explicit
// MembershipPermission override rows with allowed:false stripping something
// the role would otherwise grant. Confirmed live: both /api/v1/company-settings
// and /api/v1/users returned the generic "not authorized" message (the one
// requireTenantPermission's default AuthorizationError throws), not either of
// requireModule's more specific licence messages — so this is a permission
// override, not a module-licence problem.
//
// This script is READ-ONLY by default (dry run) — it just reports what's in
// the database. Pass --apply to actually delete deny-overrides that are
// blocking a COMPANY_ADMIN membership from having the full access their role
// should grant. It only ever touches MembershipPermission rows with
// allowed:false on a COMPANY_ADMIN membership — it never touches roles,
// entitlements, or any other user's data.
//
// Usage:
//   npx tsx scripts/diagnose-and-fix-company-admin-permissions.ts            (dry run, reports only)
//   npx tsx scripts/diagnose-and-fix-company-admin-permissions.ts --apply    (deletes the deny-overrides found)

import { prisma } from "../src/lib/prisma";
import { DEFAULT_TENANT_PERMISSIONS } from "../src/lib/auth/permissions";

const APPLY = process.argv.includes("--apply");

async function main() {
  const memberships = await prisma.companyMembership.findMany({
    where: { role: "COMPANY_ADMIN" },
    include: {
      user: { select: { id: true, displayName: true, email: true, active: true } },
      company: {
        select: {
          id: true,
          internalCode: true,
          legalName: true,
          tradingName: true,
          status: true,
          entitlements: { where: { product: "WORKSHOP", module: "DASHBOARD" } },
        },
      },
      permissions: true,
    },
  });

  if (memberships.length === 0) {
    console.log("No COMPANY_ADMIN memberships found at all — nothing to check.");
    return;
  }

  console.log(`Found ${memberships.length} COMPANY_ADMIN membership(s):\n`);

  let totalDenyRows = 0;
  const toDelete: string[] = [];

  for (const m of memberships) {
    const companyLabel = m.company.tradingName ?? m.company.legalName;
    console.log(`— ${m.user.displayName} <${m.user.email}> @ ${companyLabel} (${m.company.internalCode})`);
    console.log(`  membership id: ${m.id}   status: ${m.status}   user active: ${m.user.active}   company status: ${m.company.status}`);

    const dashboardEntitlement = m.company.entitlements[0];
    console.log(`  DASHBOARD entitlement row: ${dashboardEntitlement ? JSON.stringify({ status: dashboardEntitlement.status, expiresAt: dashboardEntitlement.expiresAt, readOnlyOverrideUntil: dashboardEntitlement.readOnlyOverrideUntil }) : "none (falls back to company defaultGracePeriodDays policy)"}`);

    const defaultPermCount = DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN.size;
    console.log(`  COMPANY_ADMIN role default grants all ${defaultPermCount} tenant permissions.`);

    if (m.permissions.length === 0) {
      console.log(`  No permission overrides on this membership — role default applies cleanly. OK.\n`);
      continue;
    }

    const denyRows = m.permissions.filter((p) => !p.allowed);
    const allowRows = m.permissions.filter((p) => p.allowed);

    if (allowRows.length > 0) {
      console.log(`  ${allowRows.length} redundant allow-override(s) (COMPANY_ADMIN already grants these): ${allowRows.map((r) => r.permission).join(", ")}`);
    }

    if (denyRows.length > 0) {
      totalDenyRows += denyRows.length;
      console.log(`  ⚠ ${denyRows.length} DENY override(s) stripping permissions this Company Administrator should have:`);
      for (const row of denyRows) {
        console.log(`      - ${row.permission}  (MembershipPermission id: ${row.id})`);
        toDelete.push(row.id);
      }
    } else {
      console.log(`  No deny-overrides — role default applies cleanly. OK.`);
    }
    console.log("");
  }

  if (totalDenyRows === 0) {
    console.log("No deny-overrides found on any COMPANY_ADMIN membership. If access is still denied, the cause is elsewhere (module licence/entitlement state, or the affected user's role isn't actually COMPANY_ADMIN — re-check via the Users page or /api/v1/session while logged in as them).");
    return;
  }

  if (!APPLY) {
    console.log(`\nDry run only — no changes made. Re-run with --apply to delete the ${totalDenyRows} deny-override row(s) listed above and restore full Company Administrator access.`);
    return;
  }

  const result = await prisma.membershipPermission.deleteMany({ where: { id: { in: toDelete } } });
  console.log(`\nDeleted ${result.count} deny-override row(s). Affected Company Administrator(s) now have the full permission set their role grants — they may need to log out and back in (or just refresh) to pick up the change.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
