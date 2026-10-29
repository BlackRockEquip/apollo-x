cd "C:\Projects\Apollo X Working"
# Reports: redesigned look for every tab. No migration.
git add -A
@'
Reports: professional redesign of every tab

One page header with Print, the period picker and Export CSV in a single row, and a roomier tab strip. Every tab starts with summary tiles and uses white cards with a header and divider. Jobs per customer: tiles, a ranked bar list with each customer's share, and an All customers table with avatars, search and a footer. Warranty jobs: tiles and by component / by customer tables with a coloured status mix and column legend. Monthly: customer and range filters, the existing interactive chart (no longer width capped) and a new month by month table with totals. Ratios: grouped into Delivery and quality / Customers and procurement, big values with a progress bar on percentages. Overview: six tiles, top customers, warranty mix with counts and shares, and the monthly trend. Customer view: back link, tiles, trend, warranty by component and an All jobs table with coloured status pills.

Data loading, CSV exports and printing are unchanged. Shared helpers in src/lib/ui/avatar.ts, src/lib/ui/job-tone.ts and src/lib/reports/ratio-format.ts (tested).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
