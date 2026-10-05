cd "C:\Projects\Apollo X Working"
git add -A
@"
Job parts: supplier typeahead after clearing, and Undo receive on a part-used reservation

User reports: (1) "removing a supplier and trying to type does not pickup
dropdown of suppliers, when clicking tab it selects the dropdown" and (2) "when
clicking undo receive and reclicking mark received it does not work."

Supplier typeahead (JobWorkspace.tsx)
- Clearing a supplier saved in the background and, when the save finished, reset
  the picker (closed it and wiped the query). Someone who cleared a supplier and
  went straight on to type a new one lost their text and the dropdown a moment
  later. Only picking a supplier now resets the picker; clearing leaves it alone,
  and the supplier box is no longer disabled while a row save is in flight.

Undo receive (inventory/service.ts)
- The database allows only ONE active reservation per reference
  (StockReservation_active_reference_key). Undo receive put the returned stock
  back and then tried to create a second reservation for the line; when the
  first one was still active (only partly used), that raised a unique violation,
  which aborts the whole transaction even though the error was caught, so the
  undo failed. New reserveJobPartLineStockTx adds to the line's existing
  reservation at its bin, or makes a single one at one bin, and is used by both
  Undo receive and the ordered-qty reservation resize.

Changed: src/components/JobWorkspace.tsx, src/lib/inventory/service.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
