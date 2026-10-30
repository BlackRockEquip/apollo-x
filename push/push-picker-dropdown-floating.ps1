cd "C:\Projects\Apollo X Working"
# Machinist / sales rep dropdown list floats above the page (portal). Replaces the pr22 overflow tweaks. No migration.
git add -A
@'
Job screen: machinist / sales rep dropdown floats above everything, item table no longer jumps

The earlier fix made the item table stop scrolling while a list was open, so it spilled over the status stepper. The list is now drawn on its own layer on top of the page (positioned from the input, flips upward near the bottom of the screen), so nothing clips or covers it and no card or table changes while it is open. UI only, no migration.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
