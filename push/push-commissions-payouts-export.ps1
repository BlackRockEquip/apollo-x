cd "C:\Projects\Apollo X Working"
# Commissions: Payouts amount due / amount paid columns, overpaid months shown (not carried over), export rep statement. No migration.
git add -A
@'
Commissions: amount due / amount paid on Payouts, overpaid months shown, rep statement export

- Payouts tab: every month of the year with commission or a payment, Amount due and Amount paid side by side, the difference
  (still owed / paid over), status, totals, rep filter. Previously only months still owed were listed, so a month paid more
  than it works out to (Vernon Aug 2026: R9 967.50 paid, R8 152.50 due) disappeared.
- New month status "Paid more than due" (calc.ts OVERPAID + overpaid amount). Each month stands on its own: an overpayment is
  shown, never carried into another month. Tracker shows it on the month and in the Paid out tile.
- "Export statement" on the Tracker and Payouts tabs: a commission statement for ONE rep (whole year or one month, jobs optional)
  with company logo and details, summary by month (amount due / paid / difference), jobs with profit and target balance, and
  payments. Opens the print window - Save as PDF to send to the rep. Fuel used is left out.
- Tests: overpaid month (Vernon August) and payment for a month with no commission.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oXWX3xLwcuXjwaA43V
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
