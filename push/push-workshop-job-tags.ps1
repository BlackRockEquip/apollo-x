cd "C:\Projects\Apollo X Working"
# Print job tags on the Workshop build too (one tag per job). No database migration.
git add -A
@'
Job tags can be printed on the Workshop build as well

- Print menu > Job tags now shows for every job, not only Engineering jobs with an item list.
- A Workshop job (no items) prints one tag for the whole job: the job number as the big text and barcode (BRE1182, no "-1"), component, model / serial / part no., machine and plant number, customer and date in. No "Item 1 of 1" and no item list in the dialog. Copies (1-20), label size and printer choice work as before.
- Engineering item tags are unchanged (BRE1182-2, Item 2 of 5).
- Tests: whole-job tag text, item tags unchanged, label page without an item position.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
