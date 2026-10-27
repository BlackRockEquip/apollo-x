cd "C:\Projects\Apollo X Working"
# Offer the WIP View (View Only) user type to Workshop companies. No migration.
git add -A
@'
Workshop companies can now have a View only user type

The WIP View (View Only) type already existed for Engineering companies. Workshop companies now offer it too, with the same behaviour: a table-only Jobs & WIP list (Job #, Job type, Status, Machine model, Component, Mechanic ETA date, ETA Overdue), completed jobs hidden, jobs cannot be opened, and the server rejects any change. Only the list of user types offered to Workshop was changed.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
