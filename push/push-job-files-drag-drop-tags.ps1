cd "C:\Projects\Apollo X Working"
# Job Photos and Attachments: drag and drop, tag after loading, small tag chip. No database migration (tag is already a text column).
git add -A
@'
Job Photos and Attachments: drag and drop, tag after loading, small tag chip

- Both cards have a drop zone: drag several files in (or Choose photos / Choose files), tag and note each one, then add them all together. Failed files stay in the list with the reason.
- Tag all as ... sets one tag on everything loaded. Photos keep Before / After / Fault / Serial plate / Other; attachments get Drawing / Quote / Certificate / Report / Other.
- The tag in the list is a small chip (it no longer stretches across the card); click it to change or clear the tag any time, or "+ Add tag" when there is none. Attachments show a PDF / DOCX / XLSX badge.
- Tags now show on every job type, not only field-service jobs. View-only users no longer see the upload area.
- Server: attachment PATCH can change the tag (the note is untouched), tag must suit the kind of file.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
