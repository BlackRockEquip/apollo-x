cd "C:\Projects\Apollo X Working"
# Build fix: AppShell menu item type now knows the supportWriteOnly flag (no database change).
git add -A
@'
Fix build: AppShell nav item type includes supportWriteOnly

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
