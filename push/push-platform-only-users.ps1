cd "C:\Projects\Apollo X Working"
# Users are managed by Flo X platform admins only (no database change).
# Close the project files in your editor before running.
git add -A
@'
Users are managed by Flo X platform admins only

- Company admins no longer have a Users tab under Settings, and cannot add, edit, reset or delete users (the server refuses it too).
- A Flo X platform admin adds users from Platform > Companies > the company > Add user, and uses Manage users (read-write support session) to switch modules on/off, reset or remove a user. The Users tab shows only inside that session.
- Broadcast and support tickets for company admins are unchanged.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
