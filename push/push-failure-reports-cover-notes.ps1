cd "C:\Projects\Apollo X Working"
# Failure Reports: cover page details no longer behind the photo, smaller cover photo, Notes on the last page. No migration.
git add -A
@'
Failure Reports: cover details clear of the photo, smaller cover photo, Notes section on the last page

- User: "when print previewing the report, it show the company details behind the cover image". A long value (a client name on two
  lines) made the job-details table taller than its fixed place; the row heights are now worked out, and the company details and
  cover photo sit below the table. The details box grows with its text too.
- User: "Can the cover image be a little smaller?" The cover photo is at most 105 mm high (was up to ~140 mm), centred.
- User: "on the last page, add a note section that a user can fill in". New Notes field (Findings card); printed in a NOTES box
  under the lists, filling the rest of the page. Empty = ruled lines to write on by hand. Preview and PowerPoint both.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oWQMSgA2rwfJEsDMsg
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
