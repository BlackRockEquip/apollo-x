# Workshop Track - progress 2026-11-03: Platform company page in tabs + users managed in-page (pr37)

**Request:** In Platform admin > a company, "Add user" told me to enter the company users page / start a support session. Manage users from this screen, mock up the company view first, and fix the long scrolling. (Mockup approved: "much better, build it".) Mockup: `platform-company-view-mockup-2026-11-03.md`.

## What changed
- Company page is tabbed: Overview (stat cards, details, recent audit, quick actions, status), Users (count), Company & branding, Storage, Industry build, Support & audit, Reset & clone (not shown for Black Rock). Tab is kept in `?tab=`; saving a form returns to the right tab.
- Users tab: search, role + status filters, counts, gold "Add user". Table with avatar, role, module summary, status, Edit and a "more" menu (Sign out everywhere, Remove from company). Add/Edit open in a right-side drawer: name, role, email (add), password, Can sign in, membership status, module tiles (All/None), account actions. No support session needed.
- New platform API `GET/POST /api/v1/platform/companies/:id/users`, `GET/PATCH/POST/DELETE .../users/:membershipId`. Needs `PLATFORM_TENANT_ADMINS_MANAGE`.
- `lib/users/service.ts` split into Core functions (list/editor/update/reset sessions/delete) taking companyId + audit source; tenant wrappers unchanged (source "API"), platform wrappers use "PLATFORM".
- New error `COMPANY_NOT_ACTIVE` (409) when changing users of a deactivated company.
- No database migration.

## Files
New: `lib/platform/company-users-service.ts`, `lib/users/module-tiles.ts`, `components/PlatformCompanyUsers.tsx`, `components/CompanyTabs.tsx`, platform users API routes (2), `tests/unit/platform-company-users.test.ts` (10 tests pass).
Changed: `app/platform/companies/[id]/page.tsx`, `platform-theme.css` (pcv-*/pcu-*), `lib/users/service.ts`, `lib/http/errors.ts`. Push: `push/push-platform-company-users-tabs.ps1`.

## Notes / limits
- Shared-login protection still blocks name/active/password changes for logins shared across companies or platform roles.
- Writes blocked while the company is not ACTIVE (viewing allowed).
- Users tab count badge is the count at page load, not live.
- Old `addCompanyUserAction` in `actions.ts` is now unused (left in place).
- Prisma-typed code not run against a DB in the sandbox; Users tab UI checked in a browser harness, full tabbed page not.
