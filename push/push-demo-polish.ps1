cd "C:\Projects\Apollo X Working"
# Live demo polish: company renamed Ridgeline Plant Services, realistic demo user names, Finance removed,
# role switch opens the role's start page (fixes the error page). NO MIGRATION.
# The demo service rebuilds its data on deploy, so the new names appear after this push deploys.
git add -A
@'
Live demo polish: Ridgeline Plant Services, no Finance user type, role switch fix

Demo company renamed from "Test Demo Workshop" to "Ridgeline Plant Services" (fictional), with realistic demo user names and logins @ridgelineplant.example.

Finance is no longer offered as a Workshop user type (no finance module yet). Existing Finance users keep working; it is just not offered for new users. Removed from the demo role picker and demo logins.

Demo role switch: switching role used to keep the visitor on the same page, which showed an error page when the new role is not allowed there (e.g. Store controller on Jobs). It now opens the new role's start page.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oYroUZVHECm1x9ArL4
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
