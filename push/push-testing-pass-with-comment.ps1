cd "C:\Projects\Apollo X Working"
# Testing Reports: a test passed on comments reads "Pass with comment" everywhere. No migration.
git add -A
@'
Testing Reports: tests passed on comments now read "Pass with comment"

- When the tester passes a test based on their comments, the status is now "Pass with comment" in the reports list, on the job's Testing card, on the test sheet (pill, banner and confirm text) and on the printed report (result tile and footer).
- Tests passed one reading at a time with a note still read "Pass with note".
- The reports list now says which completed tests were passed on comments.
- Tests for the wording and for the list flag.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
