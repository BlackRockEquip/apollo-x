cd "C:\Projects\Apollo X Working"
# Sidebar sections open/close even for the current screen; Advertising screen gets a live sidebar preview.
# No database change.
# Close the project files in your editor before running.
git add -A
@'
Sidebar sections always toggle; Advertising preview block

- Sidebar: clicking a section (Jobs, Inventory, Settings ...) now opens or closes it even when it holds the current screen. The current screen's section still starts open; the choice resets when you move to another page.
- Platform > Advertising: new Preview block in the ad editor shows the real sidebar card from the typed text and the chosen picture (before saving), with the picture size and a warning if it is small, very wide or very tall.
- The sidebar ad card is now one shared component used by the sidebar and the preview.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
