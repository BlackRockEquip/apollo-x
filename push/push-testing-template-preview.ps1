cd "C:\Projects\Apollo X Working"
# Testing Reports: Preview button for spec templates. No migration.
git add -A
@'
Testing Reports: Preview button for spec templates

- New test dialog: a Preview template button next to the chosen spec template opens the template as a blank test sheet (test data with limits, clutch table, or the gears with their engaged clutches), so the tester can check it is the right one before starting.
- Spec templates editor: a Preview button in the header shows the template being edited, including changes not saved yet.
- Read-only, closes with Close, the X or Escape. Works for Forward / Reverse, P1 / P2 and Engaged clutches layouts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
