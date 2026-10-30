cd "C:\Projects\Apollo X Working"
# Job screen: a machinist or sales rep typed on a job that is not in the dropdown can be added on the spot. No migration.
git add -A
@'
Job screen: add a machinist or sales rep that is not in the list, right where you type it

Machinist 'Assess' / 'Final' and Sales representative on the job screen (and the New Job screen) are now type-ahead boxes. Type to filter the list; if the name is not there, "Add <name> as a new name" appears: choosing it adds the name to the same list Settings > Users > User Setup manages and selects it. The same boxes are used for each item's machinists (Reassign machinist, Edit item, New Job item rows). A name that already exists (any capitals, even one switched off in User Setup) is reused instead of duplicated. Needs at least two letters. Arrow keys, Enter and Escape work; a Mechanic-role user keeps the boxes locked.

Server: POST /api/v1/jobs/mechanics and POST /api/v1/jobs/sales-representatives (JOBS_EDIT or JOBS_CREATE, audited as MECHANIC_CREATED / SALES_REPRESENTATIVE_CREATED).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
