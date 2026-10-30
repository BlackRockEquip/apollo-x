cd "C:\Projects\Apollo X Working"
# Delivery note: ticking "move the items on this note to Delivered" now moves every ticked item that is not delivered yet. No migration.
git add -A
@'
Delivery note: the "move to Delivered" tickbox now moves the ticked items, and says what it did

Items ticked on a delivery note but still at an earlier step (e.g. QC control) were skipped silently, so the stepper did not move. Every ticked item that is not already delivered, complete, closed or cancelled is now moved to Delivered / Await payment after printing (after the documents check), and a message confirms how many moved, or why none did. Tests updated.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
