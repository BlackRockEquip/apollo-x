cd "C:\Projects\Apollo X Working"
# Commissions module. NEW MIGRATIONS (2) - run before/while deploying: new module key, 6 new tables.
npx prisma migrate deploy
npx prisma generate
git add -A
@'
Commissions module: sales rep commission per month, Company Admins only (opt-in per admin)

- New module "Commissions" (ModuleKey COMMISSIONS), built from the company's commission spreadsheet. Switched on or off per
  company from Platform > Companies > company > Industry build (Workshop and Engineering builds; off for new companies; Black
  Rock licensed). Then OPT-IN per user: only a Company Administrator with Commissions switched on in their own user profile
  sees it (Settings > Users in a support session, or Platform > Companies > company > Users). Stored as a MODULE_ON:COMMISSIONS
  membership row; session.ts denies the module to everyone else, and in platform support sessions. Managers never hold the new
  COMMISSIONS_VIEW / COMMISSIONS_EDIT permissions. "Select all" on the user screens leaves it off.
- Maths (src/lib/commissions/calc.ts), as on Vernon's November rows: profit = invoices - costs - fuel charge - other expenses;
  a line counts in the month of its first invoice; each month starts at minus the rep's monthly target and commission = rate x
  what the month ends above it. Reps with no target: rate x each line's profit (optional rate per line / no commission).
  Due at the end of the month after the client's final payment.
- Screen /commissions (sidebar Sales > Commissions): Tracker per rep and month (target bar, sum shown, running target balance
  per job, job where the target was met, client payment status), monthly fuel used per rep (cost tracking only, never in the
  commission), Payouts (not paid yet, record / delete payments, part payments), Rep settings (rate %, monthly target).
- Add / edit invoiced job dialog: job lookup (fills job number, description and sales rep), several invoices each with
  invoice no., date invoiced (required), amount ex VAT and client paid date; costs as separate lines; live profit preview.
- A sales rep with commission history can no longer be deleted (switch them off instead).
- Migrations 20261125100000_commissions_enum and 20261125100100_commissions.
- Tests: commissions-calc (real spreadsheet figures, incl. Vernon Nov R3 150.30) and commissions-access.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oXWX3xLwcuXjwaA43V
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
