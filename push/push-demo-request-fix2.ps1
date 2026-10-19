cd "C:\Projects\Apollo X Working"
# Fix: the demo-request address was being redirected to the login page by src/proxy.ts. It is now on the public list. No other changes.
git add -A
@'
Allow the demo-request endpoint through the sign-in redirect (proxy.ts)

- /api/v1/public/demo-request is added to PUBLIC_PATHS so the landing page form (signed out, from floxintegrations.co.za) reaches the route instead of being redirected to /login.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
