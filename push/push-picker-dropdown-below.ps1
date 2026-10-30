cd "C:\Projects\Apollo X Working"
# Machinist / sales rep dropdown opens below the field like a normal dropdown. No migration.
git add -A
@'
Job screen: machinist / sales rep dropdown opens directly below the field again

Near the bottom of the screen the list was drawn from the top of the page (a leftover style stretched it). It now always sits right under the field; if the field is low on the screen the page scrolls it up first so the list has room, and it only opens upward when the page cannot scroll any further. UI only, no migration.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
