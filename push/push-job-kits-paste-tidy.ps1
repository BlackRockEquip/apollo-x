cd "C:\Projects\Apollo X Working"
# Job kits: tidier "Kit lines" panel. No migration.
git add -A
@'
Job kits: simpler Kit lines panel and descriptions that replace "Imported part"

- Removed the file import (Choose File, Import and the template button) from the kit lines.
- "Add pasted parts" is now a gold button, and "Add part" for the one-at-a-time form is gold too.
- The paste hint now reads PN1001, 2, Description and PN1002, 4, with a short line explaining the format.
- A description typed in the paste replaces the "Imported part ..." stand-in, on the catalog part and on the kit line, for a new part and for one added that way before. A real description is never overwritten. The result message says how many were updated.
- Removed the Order column and the Sort order field. New lines go to the end of the kit.
- The one-at-a-time form is now one row, and the panel shows a line count.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
