cd "C:\Projects\Apollo X Working"
git add -A
@'
New Job page: two columns with a summary, Commercial & logistics collapsed

The New Job form is no longer one long column. The form sits on the left and a summary stays beside it: the jobs that will be created (with their type colour and machine or component), what is still needed (a customer), and a Create button next to where you finish. Commercial & logistics starts collapsed as an optional card with Show / Hide, since it can be filled in after creating. Notes can now be typed in the customer card on a new job. On narrow screens the summary drops under the form. No data changes.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
