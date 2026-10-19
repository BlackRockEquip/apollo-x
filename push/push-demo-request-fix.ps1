cd "C:\Projects\Apollo X Working"
# Fix for the Render build error in the demo-request route (TypeScript header typing). No other changes.
git add -A
@'
Fix demo-request route header typing (Render build)

- corsHeaders now returns Record<string, string> so the Next.js type check accepts it. No behaviour change.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
