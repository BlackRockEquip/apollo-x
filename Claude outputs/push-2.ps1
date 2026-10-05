cd "C:\Projects\Apollo X Working"
git add -A
@"
Job parts: multi-bin add no longer fails silently, longer transaction timeouts, errors visible

User reports "error still on both" (supplier typeahead, Undo receive then Mark
received). Reproduced the server flows against a local Postgres with all repo
migrations; receive / undo / re-receive and supplier set / clear pass there, but
the reproduction exposed a real silent failure and some fragility.

Fixes
- addPartLinesBulk reserved stock across several bins, creating more than one
  ACTIVE reservation for the same part line. The database allows only one
  (StockReservation_active_reference_key); the violation aborted the Prisma
  transaction but the call still reported success, so no line was created. It now
  uses reserveJobPartLineStockTx (one reservation, partial if needed).
- Heavier part-line transactions (add, receive, undo receive, order update, pick
  slip create/cancel) now set maxWait/timeout so slow queries don't hit Prisma's
  5 s default and roll back.
- Stock Levels pick-slip lines now record stockIssuedQuantity, so Undo receive
  on those lines does not deduct stock twice.
- Readable 409 messages for PART_LINE_ALREADY_FULLY_RECEIVED,
  PART_LINE_RECEIVE_EXCEEDS_OUTSTANDING and PART_LINE_ALREADY_HAS_DESCRIPTION
  instead of a generic 500.
- Parts table now shows an error banner directly above the table, so a failed
  save/receive is visible without scrolling to the top of the page.

Changed: src/components/JobWorkspace.tsx, src/lib/inventory/service.ts,
src/lib/jobs/service.ts, src/lib/http/errors.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
