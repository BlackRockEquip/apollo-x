cd "C:\Projects\Apollo X Working"
# Platform Users: a brand-new person can now be added as a platform administrator (or any platform role).
# No database change.
# Close the project files in your editor before running.
git add -A
@'
Platform Users: add a brand-new platform user (name, email, starting password, role)

- The "Grant platform role" box only worked for someone who already had a login (from a company), so a new platform administrator could not be added. It is now "Add platform user": enter name, email, starting password and role and the login is created with the platform role. If the email already has a login, only email and role are needed.
- Validation: valid email, name of at least 2 characters, password of at least 8 characters; clear messages for each. The existing safeguard still applies (an active company member cannot be given a platform role).
- The audit entry records whether the login was created.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
