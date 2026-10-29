cd "C:\Projects\Apollo X Working"
# Engineering job screen: the item list sits above the item header and tabs (as in the item mockup). No migration.
git add -A
@'
Engineering job screen: item list moved above the item header and tabs

The "Items on this job" list used to sit inside the Details tab (under Customer details), so the item header said "select one in the list above" with no list above it, and no item could be picked from the Outwork, Specifications, Photos & files or Activity tabs. The list now sits between the summary strip and the item header card, so it is on screen whatever tab is open, as in the item mockup. A "Hide list / Show list" button folds it away (open by default). The selected item's detail card stays in the Details tab. One-item jobs are unchanged.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
