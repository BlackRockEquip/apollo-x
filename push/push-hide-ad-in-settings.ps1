cd "C:\Projects\Apollo X Working"
# Sidebar ad is hidden while the Settings menu is open. No database migration.
git add -A
@'
Hide the sidebar ad while the Settings menu is open

- Opening Settings in the sidebar (or being on a settings page, where it starts open) hides the ad; closing Settings brings it back.
- No other sidebar behaviour changes (Reports and the other groups stay as they were).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
