cd "C:\Projects\Apollo X Working"
# Industry builds, step A. Run the database migrations afterwards with your usual process (prisma migrate deploy).
git add -A
@'
Industry builds, step A: build selector and module switches on the company page

- Companies now have an industry build (Workshop Business or Engineering Business), chosen when the company is created.
- The Modules / Licensing card on the company page is replaced by an Industry build section: a build dropdown,
  a button per module to activate or deactivate it, and per-module licensing (state, source, start, expiry).
- Core modules (Jobs & WIP, Customers & suppliers, Reports, Dashboard) are locked on. Black Rock stays read-only.
- New module keys: Job parts & ordering, Pick slips, Specifications. Two migrations: enum values + build column,
  then a backfill so every existing company keeps exactly the access it has today.
- New companies are given the core modules plus their build's default modules. Page/menu enforcement of the new
  switches comes in step B.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
