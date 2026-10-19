cd "C:\Projects\Apollo X Working"
# Landing page demo request: the "Request a demo" form on floxintegrations.co.za posts to this app, which emails floxadmin@floxintegrations.co.za.
# No database migration. Needs the platform email (SMTP) settings to be filled in and working (the same ones the forgot-password email uses).
git add -A
@'
Demo request endpoint for the landing page (email notification)

- New public endpoint POST /api/v1/public/demo-request. The "Request a demo" form on floxintegrations.co.za posts to it and the app emails the request to
  floxadmin@floxintegrations.co.za through the platform email (SMTP) settings. Reply-To is the visitor, so replying answers them directly. Nothing is stored; no migration.
- Safeguards: only the landing page's addresses (floxintegrations.co.za and www) are accepted by the browser check (CORS); fixed fields with length limits; plain-text email only; hidden
  bot field; rate limits per IP (5/hour), per visitor email (3/hour) and overall (30/hour); a clear message if email is not configured.
- Optional settings: DEMO_REQUEST_TO (send somewhere else) and DEMO_REQUEST_ALLOWED_ORIGINS (comma-separated websites allowed to call it).
- sendPlatformEmail gained an optional replyTo.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
