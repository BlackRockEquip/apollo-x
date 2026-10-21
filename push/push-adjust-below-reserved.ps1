cd "C:\Projects\Apollo X Working"
# Stock adjustment / stock count below the quantity reserved for jobs: choose to release the job reservations. No database change.
# Close the project files in your editor before running.
git add -A
@'
Stock adjustment: release job reservations when the stock is not on the shelf

- Adjusting stock down (or posting a stock count) below the quantity reserved for jobs used to stop with "not enough available stock". It now stops with a clear message naming the jobs, and the Adjust window shows a tick box "Release the job reservations - the stock is not on the shelf" (stock take: a "Release the job reservations and post the count" button).
- With the release chosen, the bin's reservations are cut back (newest first) by exactly the shortfall. Each affected job part line that was waiting on that stock (In stock / Picked) goes back to Pending and the job's history records it; the stock-count that was saved for the retry is cancelled so no duplicate open count is left behind.
- On-hand can still never go below zero.
- Tests: tests/unit/adjust-reserved-stock.test.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
