cd "C:\Projects\Apollo X Working"
# Mechanic view: pick slip requests, Model/Component on "This job", separate Photos and Attachments.
# HAS A MIGRATION (prisma/migrations/20261027120000_pick_slip_requests_job_photos): Render applies it on deploy.
git add -A
@'
Mechanic view: request a picking slip, model fields on This job, separate Photos and Attachments

Stock Levels: a mechanic can tick in-stock parts and send a picking slip request for a job (nothing is issued). Store controllers, managers and admins get a Pick requests tab to create the real picking slip or decline it, and are notified; the mechanic is told when it is done.

This job (tablet): Machine, Model, Component and Component model now show on the card.

Job files are split into Photos and Attachments. A mechanic sees and adds photos only; the server leaves Attachments out of what it sends them and refuses them. Existing image files become photos in the migration.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
