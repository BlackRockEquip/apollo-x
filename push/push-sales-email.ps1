cd "C:\Projects\Apollo X Working"
# Contact email floxadmin@ -> sales@floxintegrations.co.za (demo request notifications + proposal default). NO MIGRATION.
# Include this with push-demo-polish.ps1 if that has not been pushed yet (git add -A picks up both).
git add -A
@'
Use sales@floxintegrations.co.za instead of floxadmin@

Landing page demo requests are now emailed to sales@floxintegrations.co.za by default (DEMO_REQUEST_TO still overrides), the "please email us" fallback message names sales@, and new proposal price lists default to sales@ as the prepared-by email.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oYroUZVHECm1x9ArL4
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
