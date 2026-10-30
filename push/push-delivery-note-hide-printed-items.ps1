cd "C:\Projects\Apollo X Working"
# Delivery note: items that already have a printed delivery note are no longer offered in the picker. No migration.
git add -A
@'
Delivery note: an item that already has a printed delivery note is removed from the list to pick from

When the delivery note window opens it reads the job's delivery notes and leaves out every item that is already on one (and cancelled items). If every item already has a note, the window says so and points to the Delivery notes list for reprints. Tests added.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
