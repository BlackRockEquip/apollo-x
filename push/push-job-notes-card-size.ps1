cd "C:\Projects\Apollo X Working"
# Job view: Notes card the same size as Customer details. No migration.
git add -A
@'
Job view: Notes card is the same size as the Customer details card

- The Notes card now stretches to the height of the Customer details card beside it, and the notes box fills the card (it can still be dragged taller).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
