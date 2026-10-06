cd "C:\Projects\Apollo X Working"
git add -A
@"
Support forms: show a readable error when the server returns a non-JSON page

User report: submitting a support ticket as Org Admin showed
Unexpected token '<', "<!DOCTYPE "... is not valid JSON. That means the request
got an HTML page back (expired sign-in redirected to /login, or the server was
restarting / returned its own error page), not a reply from the Support API.
SupportRequestDialog and SupportWorkspace now read the response as text first and,
if it is not JSON, say "Your sign-in has expired" (redirected to login) or
"unexpected response (HTTP <status>)" instead of the parse error.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
