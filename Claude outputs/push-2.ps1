cd "C:\Projects\Apollo X Working"
git add -A
@"
Stock Take: fix "The request is invalid." when starting a count

Selecting a bin location and clicking "Start count" always threw this
error. Root cause: the request asked for every part in the location in
one shot (pageSize=500), but the positions endpoint's own validation
(positionQuery, inventory/validation.ts) caps pageSize at 100 - every
single request failed that check before it ever reached the database,
regardless of how many parts the location actually had.

Fixed by paging through the results at the real 100-item cap and
accumulating them, instead of lowering the request to pageSize=100 and
leaving it at that - a bin with more than 100 distinct parts would
have silently dropped the rest from the count sheet, which is worse
for an actual physical stock take than a slightly slower load.

Also fixed the same class of bug found while in this code: the
Add/Edit Part drawer's Tax code dropdown fetch asked for pageSize=200
against master-data's tax-codes endpoint, which has the same 100 cap -
that request has been silently failing (swallowed, not thrown) since
it was written, so the Tax code list has likely never actually
populated. Capped at 100 to match.

Changed: src/components/StockLevelsWorkspace.tsx.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
