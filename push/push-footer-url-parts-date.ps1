cd "C:\Projects\Apollo X Working"
# Footer web address under "Powered by Flo X Integrations" on every document; Print Parts List shows the date printed.
# No database change.
# Close the project files in your editor before running.
git add -A
@'
Footer web address on all documents; date printed on the Parts List

- Every printed or saved document: the web address (www.floxintegrations.co.za, a link on screen print windows) now sits on the line below "Powered by Flo X Integrations". Still hidden for companies where the Powered-by line is switched off.
- Job > Print Parts List: "Printed: <date>" is on the sheet (print window and saved PDF).
- Tests: web address under the footer line, parts list printed date; the page-count test now reads the PDF properly.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
