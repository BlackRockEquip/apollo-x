cd "C:\Projects\Apollo X Working"
git add -A
@"
Pex pill: also on PEX Return jobs still in repair or not yet reallocated

User request: add the Pex pill to all PEX Return type jobs that are
still in the repair process or have not been reallocated.

The pill (job header and Jobs & WIP table) used to show only for jobs
sent to PEX Inventory with the button. It now shows whenever the job's
unit is in PEX Stock: a non-scrapped PEX return record that hasn't been
redeployed to another job (consumedByJobId empty), on a job that has
arrived (not TO_BE_RECEIVED). That is the same base filter PEX Stock
itself uses, so it covers a PEX Return job mid-repair and one that is
finished and waiting to be reallocated, plus direct allocations. Once
the unit is redeployed, or scrapped, the pill goes away. The "Pex"
entry in the Jobs & WIP status dropdown uses the same rule.

PEX Return jobs still To be received don't get the pill, since PEX Stock
doesn't list them yet.

Changed: src/components/JobWorkspace.tsx, src/app/(tenant)/jobs/page.tsx,
src/lib/jobs/service.ts, src/lib/jobs/validation.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
