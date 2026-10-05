cd "C:\Projects\Apollo X Working"
git add -A
@"
Job documents: ask to save only after Print is clicked (no separate Save buttons)

User feedback: the Save to folder buttons were not right - the question should
only appear once the respective Print button is clicked.
- Removed the standalone "Save to folder" buttons/menu.
- Print job card / Job History / Delivery Note / Parts List / Pick slip /
  Outwork delivery note now print as before and then ask "Save to the job
  folder?" with the file name ("<JOB NUMBER> - <title>.pdf"). Yes saves the PDF
  into the job folder and Attachments; No thanks does nothing. Nothing is
  asked if the print window was blocked.
- The print functions now report whether the print window opened.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
