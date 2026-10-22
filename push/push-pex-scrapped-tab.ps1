cd "C:\Projects\Apollo X Working"
# PEX Stock: Scrapped jobs tab with an Un-scrap button; scrapped units leave PEX Tracking. No database change.
# Close the project files in your editor before running.
git add -A
@'
PEX Stock: Scrapped jobs tab with Un-scrap; scrapped units removed from PEX Tracking

- PEX Stock now has two tabs, Stock and Scrapped jobs (/pex-stock?tab=scrapped). Scrapped jobs lists every scrapped unit: job number, unit, make, model, when it was scrapped, who scrapped it, the reason, the original supply job, and History. Search, print and column filters work like on the Stock tab.
- New Un-scrap button on that tab (needs the same permission as Scrap unit): the unit goes back into PEX with its status worked out from its return job, a note is added to the return job and the unit's history records it.
- PEX Tracking no longer lists scrapped units (list, summary cards, and the Scrapped option in its status filter are gone).
- A scrapped unit now stays scrapped when its return job's status changes; before, moving that job to another status quietly turned the record back into an ordinary one.
- The job's Scrap PEX unit dialog no longer says it cannot be undone.
- Tests: tests/unit/pex-scrapped.test.ts, tests/unit/pex-unscrap.test.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
