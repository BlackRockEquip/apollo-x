cd "C:\Projects\Apollo X Working"
git add -A
@"
Jobs & WIP: remove the filter pills under the search bar, add "Pex" to
the status dropdown

User request: remove the search pills under the search bar in Jobs & WIP,
and add status Pex to the search dropdown.

The pill strip (All jobs / Drafts / Collection / Workshop / ... /
Completed / All WIP) is removed. "Pex" is added to the status dropdown;
it filters to jobs directly allocated to PEX Inventory (return record
with no supply job, not scrapped) via a new pexAllocated query flag
(jobsListQuery + mapListScopeWhere), the same test as the Pex pill.

The pills were the only way to reach the "Returned unrepaired" filter (a
flag, not a status), so the existing "Returned unrepaired" entry in the
status dropdown - which used to filter the retired RETURNED_UNREPAIRED
status and match nothing - now maps to that flag instead. Older
/jobs?returnedUnrepaired=true links still work.

Changed: src/app/(tenant)/jobs/page.tsx, src/lib/jobs/service.ts,
src/lib/jobs/validation.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
