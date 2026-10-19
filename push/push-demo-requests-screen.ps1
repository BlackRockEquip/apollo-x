cd "C:\Projects\Apollo X Working"
# Platform > Demo Requests screen. ONE new migration (20261019170000_demo_requests: a new DemoRequest table) - Render runs it on deploy (prisma migrate deploy in the build command).
git add -A
@'
Platform > Demo Requests: landing page enquiries saved and shown in the app (New / History)

- Requests from the "Request a demo" form on floxintegrations.co.za are now saved (new DemoRequest table, migration 20261019170000) as well as emailed to floxadmin@floxintegrations.co.za. If the email cannot be sent the request is still kept; if neither works the visitor is asked to email directly.
- New sidebar button Platform > Demo Requests with a red count of new requests. Two views: New and History. View opens a window with all details (Reply by email link); Move to history records who and when; Move back to New undoes it.
- Needs platform support read access to see, support write access to move requests; platform admins have both.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
