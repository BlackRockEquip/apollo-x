cd "C:\Projects\Apollo X Working"
# Advertising: Pause/Resume apply at once, the Advertising screen refreshes itself, the sidebar ad picks up changes within a minute.
# No database change.
# Close the project files in your editor before running.
git add -A
@'
Advertising: Pause/Resume saves at once; screens refresh themselves

- Platform > Advertising: Pause / Resume now saves immediately (no separate Save), and the list and open ad update straight after any save, image removal or delete without a page refresh.
- The Advertising screen also refreshes itself every 30 seconds and when the browser tab is shown again (live / next-up labels, views, clicks) without disturbing an ad being edited.
- Company sidebar ad block checks for changes every minute and when the tab is shown again (was every 5 minutes), so a paused ad disappears quickly.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
