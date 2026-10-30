cd "C:\Projects\Apollo X Working"
# Job screen: Customer details, Notes, Job details and Commercial & logistics sit above the items card. No migration.
git add -A
@'
Job screen: move Customer details, Notes, Job details and Commercial & logistics above the items card

On an open Engineering job the four job-level cards now sit above the items card (two across), so they stay on screen whichever tab is open. The Details tab keeps only the selected item's details (Machine / component, Delivery notes). Fields autosave exactly as before. Field service and the mechanic tablet layout are unchanged. UI only, no migration.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
