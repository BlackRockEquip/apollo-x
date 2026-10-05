cd "C:\Projects\Apollo X Working"
git add -A
@"
Jobs & WIP: show the "Pex" pill next to status for PEX-allocated jobs

Follow-up to the job-header Pex pill: the Jobs & WIP table's Status
column now shows the same teal "Pex" pill beside the status (and beside
the Return Unrepaired pill if both apply) for jobs directly allocated to
PEX Inventory - a return record with no supply job, not scrapped. The
list query now selects the PEX return record's supplyJobId and status to
drive it; same test as the job header.

Changed: src/lib/jobs/service.ts, src/app/(tenant)/jobs/page.tsx.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
