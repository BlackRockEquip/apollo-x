cd "C:\Projects\Apollo X Working"
# Platform > Companies: Reset and Clone buttons. No database change.
# Close the project files in your editor before running.
git add -A
@'
Platform companies: Reset company and Clone company buttons

- Companies table and company page: new "Clone" and "Reset" buttons next to Open/Delete (not shown for Black Rock on Reset).
- Reset: opens a window; "Reset Company" must be typed before the Reset button works (checked again on the server). Deletes all the company's data (jobs, customers, suppliers, parts, stock, PEX, RFQs/quotes, notes, attachments and their stored files, support tickets, history) and sets document numbering back to 1. Keeps the company, build and modules, users and access, branding/logo, SMTP and email templates, tax codes, payment terms, job types, mechanics, sales reps. All-or-nothing: if anything blocks, nothing changes.
- Clone: creates "<name> - copy" (legal and trading name) with a new code (<CODE>-COPY, -COPY2, ...). Copies build, modules, branding and logo, contact details, SMTP host/user/from (not the password), email templates, tax codes, payment terms, job types, document numbering (counters at 1). No users, no data; storage location is the platform default.
- Both write audit events (PLATFORM_COMPANY_RESET / PLATFORM_COMPANY_CLONED).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
