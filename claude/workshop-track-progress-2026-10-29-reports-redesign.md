# Workshop Track progress - 2026-10-29 - Reports redesign (all tabs)

## Request
"mockup a better spacing and more ui professional design" for Reports > Jobs per customer, then "mockup the other tabs as well so we fix in one go", then "Build it". Mockup canvas: "Reports - Jobs per customer" (Design artifact).

## What changed (front end only - no API, schema or migration change)
- `src/components/ReportsWorkspace.tsx` rewritten on new shared `rp-` styles (end of `src/app/globals.css`). Data fetching, CSV exports and Print behave as before.
- Page header: eyebrow, title, subtitle on the left; Print, period picker and Export CSV in one row on the right. The Export button runs whatever the open tab registered (`useRegisterExport`); hidden on Overview, and still gated by REPORTS_EXPORT. Period picker hidden on Monthly (it has its own range). Tab strip is roomier with a gold underline.
- Jobs per customer: tiles (customers, total jobs, biggest customer + share, warranty), ranked bar list with rank and share %, All customers table (avatar, search, open/closed/warranty, footer).
- Warranty jobs: tiles with status dots; by component / by customer tables with the status mix bar and a colour dot on each count column.
- Monthly: customer + 12/24 month filters, existing CombinedAnalyticsChart (hover, keyboard, table view) in a full-width card, new Month by month table with totals.
- Ratios: two groups (Delivery and quality / Customers and procurement; any new ratio lands in "More"), big value + unit, progress bar for percentages.
- Overview: six tiles, top 5 customers, warranty mix with counts and shares, monthly trend, "View details" links.
- Customer view: back link, tiles, trend, warranty by component, All jobs table with coloured status pills; "Export jobs CSV" kept inside the jobs card.

## Helpers (pure, tested in tests/unit/ui-avatar.test.ts and ratio-format.test.ts)
- `src/lib/ui/avatar.ts`: `initialsOf`, `avatarTone` (stable colour per name), `sharePercent`.
- `src/lib/ui/job-tone.ts`: `statusTone` (pill colour family), `customerJobSide` (received vs sent back), `daysBetween` - also used by the Customers/Suppliers redesign.
- `src/lib/reports/ratio-format.ts`: `splitRatioValue`, `ratioBarPercent`, `ratioGroups`.

## Notes
- Tile totals on Jobs per customer are now totals across ALL customers in the period (the mockup used the top 10 only).
- Push script: push/push-reports-redesign.ps1.
