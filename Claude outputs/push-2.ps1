cd "C:\Projects\Apollo X Working"
git add -A
@"
Reports sidebar section: jobs per customer, warranty jobs breakdown,
monthly trends, and ratios

New "Reports" button in the sidebar, above Settings, for anyone with
the (already-existing) REPORTS_VIEW permission - COMPANY_ADMIN,
MANAGER, STORE_CONTROLLER and FINANCE by default, same as every other
nav item gated by permissions.ts/page-guard.ts. Only visible once
Platform Admin grants the company the REPORTS module entitlement,
same as every other module in this app.

Four tabs:
  - Jobs per customer - a top-10 bar list plus the full table (total/
    open/closed/warranty per customer).
  - Warranty jobs - total/granted/declined/pending stat row, then
    breakdowns by component and by customer, each with a status
    composition bar.
  - Monthly - reuses the Dashboard's existing CombinedAnalyticsChart
    component as-is (jobs created/completed/warranty jobs per month),
    with an added customer filter and 12/24-month range.
  - Ratios - stat tiles for warranty-to-total-jobs, job completion
    rate, on-time delivery rate, repeat-customer rate, average
    turnaround time, job/general RFQ response rates, and average
    parts cost per job.

Before building the Ratios tab, investigated the three ratio examples
I'd originally suggested (warranty-to-total-jobs, quote-to-job
conversion, parts-to-labour cost). Two don't have real backing data:
there's no Quotes/Sales-Orders/Invoices module built yet (Job's
quoteNumber/invoiceNumber are still plain free-text fields, not linked
records - see that field's own schema comment), and no $ labour rate
is tracked anywhere (only optional field-service hours on some jobs,
with no rate attached). Surfaced this directly rather than faking
numbers; the answer ("skip for now, flag as future") is why the
Ratios tab shows those two as a dimmed "Coming soon" card naming
what's missing, instead of a number. Everything else in the Ratios
tab is backed by real stored data - including parts cost, which
turned out to need its own fix: the stock movements that actually
issue parts to a job never carry their own unit cost (only a goods-
received movement does), so the per-job parts-cost figure uses each
part's own configured purchase cost instead, not a movement field that
would have silently summed to zero.

New files: src/lib/reports/service.ts, src/app/api/v1/reports/[type]/
route.ts (one GET route, dispatched by report type), src/app/(tenant)/
reports/page.tsx, src/components/ReportsWorkspace.tsx. Changed:
src/components/AppShell.tsx (new sidebar item), src/app/globals.css
(bar-list, status composition bar, filter-select, and coming-soon
card styles for the new tabs - run through the dataviz skill's
palette validator, reusing the app's existing validated colors
rather than introducing new ones).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
