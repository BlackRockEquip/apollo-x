cd "C:\Projects\Apollo X Working"
# Public view-only demo (no login): only active where DEMO_MODE=true. The live app is unchanged.
# NO MIGRATION. After pushing, follow docs/demo-site.md to create the demo database and web service on Render.
git add -A
@'
Public view-only demo: /demo with no login, all changes switched off

New DEMO_MODE switch for a separate demo service with its own database (docs/demo-site.md). The live app is unaffected: with DEMO_MODE off nothing changes and /demo is a 404.

In demo mode: /demo signs a visitor straight into the Test Demo company (role picker: admin, manager, sales, stores, finance, mechanic); the proxy refuses every POST/PUT/PATCH/DELETE (saves, uploads, emails, deletes) and sends login, password reset and Platform back into the demo; the database client refuses all writes except sign-in sessions as a second safety net; a "Live demo" banner shows the view-only notice, the role picker and a Request a demo button, and a short note appears if a visitor tries to save. Support, Change password and Sign out are hidden. /demo refuses to open if the database holds any other company, and is rate-limited per visitor.

Tests: tests/unit/demo-mode.test.ts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oYroUZVHECm1x9ArL4
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
