cd "C:\Projects\Apollo X Working"
git add -A
@"
Reports: customer click-through, dashboard Overview tab, CSV export

Three follow-up requests on top of the Reports section shipped
earlier:

1. Click a customer to drill into their own reports. Every customer
   name across Jobs per customer (bar list + table) and Warranty jobs
   (by-customer table) is now clickable. Clicking opens a new
   "Customer" view - a tab that only appears once a customer is
   selected - showing that customer's own job totals, warranty
   breakdown by component, and monthly trend, with a button back to
   "All customers". getJobsPerCustomerReport and
   getWarrantyBreakdownReport (getMonthlyReport already did) now take
   an optional customerId and scope their query to it; the [type]
   route forwards it through for those two as well. Ratios was left
   alone on purpose - several of its numbers (RFQ response rates,
   repeat-customer rate) don't mean anything scoped to one customer.

2. "Too big and cluttered, arrange for a professional view, basically
   its own dashboard view of everything." Two changes: the Monthly
   chart previously rendered with no card around it at all and
   stretched edge-to-edge - now it sits in the same bordered,
   width-capped card every other section already uses. And a new
   Overview tab (now the default landing tab) is the actual "dashboard
   of everything" - key stat tiles, a top-5-customers list, a
   warranty-mix summary and the monthly trend chart all on one screen,
   each card linking straight into its full tab instead of repeating
   it.

3. Download/export. A quiet "Export CSV" button now sits on every
   report tab (Overview doesn't need its own - it just links into the
   tabs that have one). It's gated behind REPORTS_EXPORT, a tenant
   permission that already existed in this app for exactly this
   purpose but had nothing wired to it until now. Export builds the
   CSV client-side from whatever's already loaded on screen - these
   reports are small, fully-loaded payloads, not paginated, so there
   was no reason to add a server export endpoint.

Changed: src/lib/reports/service.ts, src/app/api/v1/reports/[type]/
route.ts, src/components/ReportsWorkspace.tsx, src/app/globals.css.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
