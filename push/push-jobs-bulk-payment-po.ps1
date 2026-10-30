cd "C:\Projects\Apollo X Working"
# Jobs & WIP bulk update: purchase order status and payment date received. No migration.
git add -A
@'
Jobs & WIP bulk update: change purchase order status and payment date received for the ticked jobs

New "PO status / payment date" button on the bulk bar (next to Change status). Pick a purchase order status and/or a payment date received (or clear the date); each ticked job is saved through the same update the job page uses, jobs that already have those values are skipped, and any that fail are listed with the reason. A Mechanic role cannot use it. Tests added.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
