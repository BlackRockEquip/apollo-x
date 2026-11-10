cd "C:\Projects\Apollo X Working"
# Job parts list: the quantity can be changed on a part that is part-received. No migration.
git add -A
@'
Job parts list: change the quantity of a part-received part

- A part that is part-received (for example 2 of 5) can now have its quantity changed. It can go down to what has already arrived but not below it.
- Setting the quantity to exactly what has been received completes the line: it becomes Received, any stock still held for it is released, and the job's history says so ("quantity changed from 5 to 2 (all 2 received, so the line is complete)").
- A fully received part still has to have its receive undone first.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
