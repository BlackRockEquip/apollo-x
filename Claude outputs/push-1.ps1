cd "C:\Projects\Apollo X Working"
git add -A
@"
Move Broadcast to its own Settings page, rename/add branding colour fields,
fix Company/Branding nav highlight, consolidate Tax Codes/Commercial
Terms/Numbering into one Configuration page

Broadcast message moved out of Settings > Users (where it was a third tab)
into its own destination at /settings/broadcast, with its own sidebar
entry (settings-nav.ts, new app/(tenant)/settings/broadcast/page.tsx).
BroadcastComposer.tsx no longer depends on a parent-supplied users list -
it loads its own via GET /api/v1/users, since it's not guaranteed to be
rendered alongside UsersWorkspace.tsx anymore. The popup banner's
background is now a solid, saturated blue instead of a near-white pastel
tint, per "make the banner background more noticable."

Company / Branding colour field labels renamed: Primary colour -> Sidebar
Button Colour, Accent colour -> Horizontal Bar Colour, Secondary colour ->
Sidebar Background Colour (CompanySettingsForm.tsx) - matches what each one
actually controls (nav highlight, topbar border, sidebar background).

New Main Background Colour field (Company.backgroundColor) controls the
app's canvas colour behind the sidebar/topbar for a tenant - wired through
the settings form, company-settings-service.ts's zod schema and write
path, session.ts's RequestContext read path, and applied as --tenant-canvas
on the themed app shell (AppShell.tsx / .tenant-themed-shell in
globals.css). Needs a real schema change (CompanySettings.backgroundColor
is a typed column, not a JSON field) - see the new migration.

Company/Branding sidebar item no longer stays highlighted while viewing
Templates or Dashboard under Settings - those routes are all prefixes of
/settings, so each nav item used to check pathname.startsWith(href) on its
own and multiple could match at once. AppShell.tsx now picks the single
longest-matching href per nav group instead.

Tax Codes, Commercial Terms and Numbering - previously three separate
top-level settings pages, each its own sidebar entry - are now one
"Configuration" destination with an internal tab strip
(ConfigurationWorkspace.tsx, new app/(tenant)/configuration/page.tsx),
matching settings-nav.ts's single "configuration" item. The page is
reachable if the viewer holds any one of the three original permissions
(new requireAnyTenantPageAccess in page-guard.ts) and only shows the tabs
they actually have the permission for. The old /tax-codes,
/commercial-terms and /numbering routes now just redirect to
/configuration so existing links/bookmarks keep working.

src/components/UsersWorkspace.tsx, src/components/BroadcastComposer.tsx,
src/app/(tenant)/settings/broadcast/page.tsx, src/lib/settings-nav.ts,
src/components/SettingsTabNav.tsx, src/components/AppShell.tsx,
src/app/globals.css, src/components/CompanySettingsForm.tsx,
src/lib/master-data/company-settings-service.ts, src/lib/auth/session.ts,
src/lib/auth/context-types.ts, src/lib/auth/page-guard.ts,
src/components/ConfigurationWorkspace.tsx,
src/app/(tenant)/configuration/page.tsx,
src/app/(tenant)/tax-codes/page.tsx,
src/app/(tenant)/commercial-terms/page.tsx,
src/app/(tenant)/numbering/page.tsx, prisma/schema.prisma,
prisma/migrations/20261001180000_company_background_colour/migration.sql.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
