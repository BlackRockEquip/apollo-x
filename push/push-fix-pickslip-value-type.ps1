cd "C:\Projects\Apollo X Working"
# Fixes the Render type-check error in the Picking Slip History value check (read-only permission set type).
# No database change.
# Close the project files in your editor before running.
git add -A
@'
Fix build: pick slip value check accepts the read-only permission set

- canSeePickSlipValue takes a ReadonlySet of permissions (the request context's type), fixing the TypeScript build error.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
