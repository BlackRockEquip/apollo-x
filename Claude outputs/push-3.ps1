cd "C:\Projects\Apollo X Working"
git add -A
@'
Jobs WIP table fits the screen; outwork delivery note Make/Model/Serial as small bold text

- Jobs & WIP table now ends exactly at the bottom of the window.
- Outwork delivery note (print and saved PDF): Make, Model and Serial are one
  line of small bold text instead of a table.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
