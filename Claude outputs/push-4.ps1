cd "C:\Projects\Apollo X Working"
git add -A
@'
Fix Print Job Card and Job History not fitting on one page

- Sheets are now a fixed A4 height (296mm, page margin 0) instead of min-height 297mm, which
  spilled onto a second page. Job Card description, notes and findings space share the
  remaining height; smaller minimums.
- Fixed the info strip CSS hitting nested label/value divs (stray divider lines).
- Job History page 1 uses the same fixed height so Parts and Outwork start page 2 cleanly.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
