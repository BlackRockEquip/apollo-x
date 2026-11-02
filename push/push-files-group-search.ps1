cd "C:\Projects\Apollo X Working"
# Settings > Files: job folders grouped in 100s, and a job-number search box. No database migration.
git add -A
@'
Settings > Files: job folders grouped in 100s, and a search box to find a job's folder by its number

- Job folders are grouped in hundreds (BRE1100 - BRE1199, BRE1200 - BRE1299 ...), newest group first, each showing how many job folders and files it holds. Open a group to see its folders (newest job first). Folders that are not job numbers (RFQs, Support, Company) stay listed below the groups. When all job folders fit in one hundred there is nothing to group, so they are listed as before.
- Search box: type a job number (or part of one, capitals and spaces do not matter) and the matching folders show straight away; the exact job number comes first and Enter opens the best match. The search is done on the server, so it finds the job even in a very large storage. Escape / X clears it.
- The group the person is in stays in the path at the top (All folders > BRE1100 - BRE1199 > BRE1182).
- Tests: grouping, search matching and ranking, and the search in the folder listing (including the "Everything on the server" view).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
