cd "C:\Projects\Apollo X Working"
# RFQ emails also copy the user who requested them. No migration.
git add -A
@'
RFQ emails: CC the user who requested it

- When a quote request (RFQ) email is sent to a supplier, the logged-in user who requested it is now copied in, together with the CC list from Settings > Templates. This covers the first request, a re-send, and requests to a newly added supplier.
- The parts Follow up email copies the requesting user as well, next to the company sending address it already copies.
- Nobody is listed twice (capitals ignored) and nobody who is already on the To line is copied. A deactivated user, or a platform support user working inside a company, is not copied.
- No change to who the supplier sees as sender, or to the RFQ status and history.
- Tests for the CC combinations.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
