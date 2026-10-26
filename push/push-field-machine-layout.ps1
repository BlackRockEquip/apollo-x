cd "C:\Projects\Apollo X Working"
# Field service jobs: machine / component fields in two rows with a new Component model field.
# Also re-applies four earlier changes that had gone back to old versions in the project folder:
#   Advertising auto-refresh (SidebarAd, AdvertisingWorkspace), disabled-button cursor (globals.css), Estimate Stock Price column (StockLevelsWorkspace).
# No database change.
# Close the project files in your editor before running (and do not "Save All" in the editor first).
git add -A
@'
Field jobs: machine / component layout in two rows + Component model; re-apply earlier changes

- Field service jobs (Work requested card and the new-job form while the type is Field service): row 1 = Machine make, Machine model, Machine serial, Plant number, Machine hours; row 2 = Component, Component model, Component serial. Fewer columns per row on narrow screens.
- Re-applied (project folder had old versions): Advertising screen / sidebar auto-refresh and Pause/Resume saving at once; standard not-allowed cursor on disabled buttons and uploads; Estimate Stock Price column on Picking Slip History.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
