cd "C:\Projects\Apollo X Working"
# Live demo fix: switching role sent visitors to https://localhost:10000/... NO MIGRATION.
git add -A
@'
Fix demo role switch sending visitors to localhost:10000

On Render the app sits behind Render's proxy and sees its own address as localhost:10000, so the /demo route built its redirect from that and sent visitors to https://localhost:10000/dashboard. It now answers with a relative Location (/dashboard, /jobs, ...), which the browser resolves against the address the visitor is actually on.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oYroUZVHECm1x9ArL4
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
