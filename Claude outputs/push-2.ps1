cd "C:\Projects\Apollo X Working"
git add -A
@"
Job parts: line linked to an inactive part record is moved to the live part

User report (BRE1071 / 4D3107): Create pick slip said "4D3107: not listed because
the part is inactive", but Stock Levels shows 4D3107 as active.

Cause: deleting a part that has history only deactivates it (HISTORICAL_REFERENCE),
and a job part line can stay linked to that dead record while the live part with
the same number is what Stock Levels shows. findPartByNumber could also resolve a
typed number to the dead record (alternate-number / hyphen-insensitive tiers).
Stock cannot be listed or issued against an inactive part, so the pick slip
skipped the line, and Mark received would have silently deducted nothing.

Changes
- parts-lookup.ts findPartByNumber: looks for an ACTIVE, operational part through
  all tiers first, and only falls back to an inactive match if there is none.
- inventory/service.ts relinkJobPartLineToActivePartTx: if a line's part is
  inactive, finds the live part for the line's own part number, releases the old
  reservation, links the line to the live part and re-reserves there.
- createPickSlipForJob and markPartLineReceived call it before listing/issuing, so
  an affected line fixes itself on the next pick slip / receive.
- The skipped reason for an inactive part now names the record the line is linked
  to when no live part matches.

Changed: src/lib/inventory/parts-lookup.ts, src/lib/inventory/service.ts,
src/lib/jobs/service.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
