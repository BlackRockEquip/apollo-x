cd "C:\Projects\Apollo X Working"
git add -A
@"
Job parts: Create pick slip says why a line was skipped; clearing order details restores the line status

User report (BRE1071, part 4D3107): after removing a typed supplier, Create pick
slip said "No stock was available to list right now (parts ordered from a
supplier are skipped). 1 line still outstanding." with no hint which line or why.

Reproduced against a local database: a supplier typed on an in-stock line moves
it to ON_ORDER and frees its reservation. Removing the supplier re-reserved the
stock but left the status on ON_ORDER, and if the line still has an Order # it
still counts as fully ordered, so the pick slip skipped it.

Changes
- createPickSlipForJob now returns skipped[] with a reason per line left off the
  slip (marked as ordered - with the Order # / supplier named, already on a pick
  slip, no stock in an active bin, inactive part). The job page shows these under
  the result banner.
- updatePartLineOrder: when order number and supplier are both cleared on an
  ON_ORDER line with nothing received, the status goes back to IN_STOCK when its
  reservation covers what is left, otherwise PENDING.
- Also includes the supplier dropdown fix (position:fixed list so the parts-table
  scroll box cannot clip it) if not already pushed.

Changed: src/lib/inventory/service.ts, src/lib/jobs/service.ts,
src/components/JobWorkspace.tsx.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
