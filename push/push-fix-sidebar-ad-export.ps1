cd "C:\Projects\Apollo X Working"
# Fixes the Render build error: SidebarAd.tsx must export SupplierAdCard (used by the Advertising preview); sidebar section toggle in AppShell.
# No database change.
# Close the project files in your editor before running.
git add -A
@'
Fix build: SidebarAd exports SupplierAdCard; sidebar sections toggle

- SidebarAd.tsx: shared SupplierAdCard / FloxAdCard / styles exports used by the Advertising preview (the earlier push contained the preview but not this file).
- AppShell.tsx: sidebar sections open/close even for the current screen.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
