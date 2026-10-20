cd "C:\Projects\Apollo X Working"
# Email / SMTP settings shown for every company (no database change).
# Close the project files in your editor before running.
git add -A
@'
Email / SMTP settings shown for every company, regardless of the RFQ module

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
