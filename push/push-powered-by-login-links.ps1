cd "C:\Projects\Apollo X Working"
# "Powered by Flo X Integrations" footer on all printed documents + per-company hide tick box + login-page logos link to the company website.
# ONE small database change (new column CompanySettings.hidePoweredBy) - it applies by itself when Render deploys (prisma migrate deploy).
# For your local copy run once afterwards:  npx prisma migrate deploy   then   npx prisma generate
# Close the project files in your editor before running.
git add -A
@'
Printed documents: "Powered by Flo X Integrations" footer; company tick box to hide it; login logos link to company website

- Every printed document (job card, history, field report, notes, pick slip, delivery note, parts lists, dimension reports, reports, stock sheets, table prints) and every server-made PDF now carries a small light-grey "Powered by Flo X Integrations" centred at the very bottom of each page.
- Platform > Companies > company: new tick box "Hide Powered by Flo X Integrations on this company's printed documents and PDFs" (saved with Save company). New column CompanySettings.hidePoweredBy (migration 20261021090000_hide_powered_by, default off). Clone copies the setting.
- Login page: a company logo in the "Trusted by" strip opens that company's website in a new tab when a website is filled in (only http/https addresses; others are ignored).
- Tests: tests/unit/powered-by.test.ts, tests/unit/website-url.test.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
