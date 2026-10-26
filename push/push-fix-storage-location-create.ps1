cd "C:\Projects\Apollo X Working"
# Fix: creating a storage location failed when Display order was left blank. No migration.
git add -A
@'
Fix creating storage locations

- Fix: adding a storage location with the Display order box left blank failed with "The request is invalid" (the form sent a blank order, which the validation rejected). A blank order now means 0.
- A location code that is already used now says so clearly, and tells you when the code belongs to an inactive (deleted but still in use) location instead of showing a generic duplicate error.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
