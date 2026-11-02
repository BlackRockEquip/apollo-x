cd "C:\Projects\Apollo X Working"
# Follow-up RFQ (Jobs > parts follow-up) also copies the address the company sends from. No database migration.
git add -A
@'
Follow-up RFQ emails now CC the sending email address

- Jobs > Follow up (parts follow-up to suppliers): every email is also copied to the address the company sends from (Settings > Email, "From address"), so the sender keeps a copy. It is added to the template's CC list from Settings > Templates; nobody is copied twice and the supplier is never copied on their own email.
- No change when email is not set up (nothing is sent then anyway).
- Tests: sender + template CC merged, no duplicates, never the To address.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
