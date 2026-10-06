cd "C:\Projects\Apollo X Working"
git add -A
@'
Field jobs: Report and Findings merged into one Report box

- The field service section shows a single Report box (Findings was the same
  thing). Text previously saved under Findings is appended to the Report when the
  job opens and is saved into Report on the next edit.
- Print Field Report and the saved PDF show one Report block.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
