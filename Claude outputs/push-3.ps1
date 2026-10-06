cd "C:\Projects\Apollo X Working"
git add -A
@'
Fix PexStockWorkspace: "use client" must be the first line

The previous commit put an import ahead of the "use client" directive, which
broke the Render build.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
