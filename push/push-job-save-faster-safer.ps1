cd "C:\Projects\Apollo X Working"
# Job screen saving: changes-only, one at a time, reload can't overwrite typing, lighter server save, save on blur / leaving. No database migration.
git add -A
@'
Job screen saving: faster and safe while typing

- Autosave sends only the fields that changed (was the whole form), one save at a time, and a reload can no longer put an older value back over what is being typed.
- Fixes the first edit after a save not being saved (the old "skip the echo" flag stayed set when the reload changed no values).
- Saves as soon as you leave a field or switch tab, and sends a pending edit when you leave the page.
- Server: the job save loads only the few fields it needs, and the component record and PEX syncs only run when the save touches a field they read.
- A save no longer waits for a full job reload; the screen is updated from the save result and the full reload happens in a quiet moment.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
