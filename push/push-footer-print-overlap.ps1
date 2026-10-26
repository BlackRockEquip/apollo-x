cd "C:\Projects\Apollo X Working"
# "Powered by Flo X Integrations" footer no longer prints over the content (Field Report and other print windows).
# No database change.
# Close the project files in your editor before running (and do not "Save All" in the editor first).
git add -A
@'
Fix: Powered by footer printed over the last lines of a page

- The footer line sat inside the printed page area, so content running to the bottom of a page printed underneath it (seen on the Field Report).
- Print windows now reserve room at the bottom of every printed page for the footer (the document body is wrapped in a one-cell table whose repeating footer row holds the space). Invisible on screen.
- Full-size sheets that set @page margin 0 (Job Card, Job History) keep their own layout.
- Tests: the reserved footer room and the margin-0 exception.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
