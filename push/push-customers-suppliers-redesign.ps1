cd "C:\Projects\Apollo X Working"
# Customers and Suppliers: redesigned list and detail pages with jobs received / sent back. No migration.
git add -A
@'
Customers and Suppliers: professional redesign with jobs received / sent back

Customers and Suppliers lists get a roomier header (Merge and New buttons), four summary tiles, a search with an Active / Inactive / All switch and a "Has open jobs" / "Has work out" filter, and a table with avatars, primary contact and email, and the key numbers. Customers show open jobs, jobs in the last 12 months and the last job in. Suppliers show brand chips, an RFQ badge, items out and overdue. Edit, Merge, Clone and list memory work as before.

Each customer and supplier page gets an avatar header with status chips, tabs with counts, summary tiles and a Jobs section laid out like WIP. Customers: Received / Sent back / All with job number, type, status pill, machine, component, date in and ETA (overdue in red). Suppliers: Sent out / Received back / All outwork with job, customer, description, qty, status, dates and days out (over 7 days is overdue). A side column shows contact(s), account details, brands, commercial terms and billing address.

New read-only endpoints: GET /api/v1/customers|suppliers/summary and GET /api/v1/customers|suppliers/[id]/jobs. The lists also return per-row stats and accept activity=open. Rules (open, overdue, turnaround) are in src/lib/master-data/party-model.ts (tested).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
