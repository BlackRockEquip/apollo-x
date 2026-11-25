cd "C:\Projects\Apollo X Working"
git add -A
@'
Job tabs: the Overview and job tabs sit at the top of the page, under the fixed header

On a job that holds several jobs, the tab bar (Overview, one tab per job, Add job) is now the first thing under the fixed header, above the facts strip, the job cards and the open job's tabs, so it is the same place whichever job or section you are on. Engineering's item list keeps its place.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
