cd "C:\Projects\Apollo X Working"
git add -A
@'
Jobs filters apply on change; Parts tabs swapped

- Jobs & WIP: picking a job type or status filters the list immediately (no Apply
  click needed).
- Parts: Parts Outstanding is now the first tab and the default page (/parts); RFQs
  is the second tab (/parts/rfq). Old /parts/outstanding and /suppliers/rfq links
  redirect.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
