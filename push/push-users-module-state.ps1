cd "C:\Projects\Apollo X Working"
# Users screen module tiles + Stock Levels pick slip tab. No migration. Close these files in your editor before running.
git add -A
@'
Users screen: show what each module tile does for the user right now; tiles with dependencies say so; module switches grant access

- Users > Edit: each module tile now shows "Saved for this user: working / not working - <reason>" (not licensed for the company, switched off for this user, or needs another module such as Job parts & ordering for Pick slips).
- A tile that depends on others (Pick slips needs Job parts & ordering and Stock levels) says "Switched on, but not working" when one of them is off for that user. Job parts & ordering no longer reads as off for roles without Job kits.
- Switching a module on for a user gives them Manager-level view/edit access to it when their role has none there; switching it off takes it away again. Only a tile's main module grants access and a normal save never widens access.
- Stock Levels: the Picking Slip History tab and the Pick column follow the Pick slips module.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
