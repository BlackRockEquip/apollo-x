cd "C:\Projects\Apollo X Working"
# Platform company page is split into tabs; users are managed inside it (no support session). No database migration.
git add -A
@'
Platform company page in tabs; users managed inside it without a support session

- Platform admin > company is now tabbed (Overview, Users, Company & branding, Storage, Industry build, Support & audit, Reset & clone) instead of one long scroll.
- Users tab: search/filter list, add, edit (name, role, password, can sign in, membership status, module access), sign out everywhere and remove - all from platform admin, no "enter support mode" needed.
- New platform API: /api/v1/platform/companies/:id/users (+ /:membershipId). Reuses the tenant user rules; audit events are marked PLATFORM.
- Writes are blocked while the company is deactivated; shared-login protection still applies.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
