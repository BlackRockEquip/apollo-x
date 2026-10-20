cd "C:\Projects\Apollo X Working"
# Company admins get User Setup (mechanics/machinists, sales reps) back; no database change.
# Close the project files in your editor before running.
git add -A
@'
Company admins keep User Setup (mechanics/machinists and sales representatives)

- Settings > User Setup is visible to company admins again: they add, edit and remove their own mechanics/machinists and sales representatives.
- The Add System Users tab is shown only to Flo X platform admins in a read-write support session.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
