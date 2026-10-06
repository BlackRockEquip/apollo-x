cd "C:\Projects\Apollo X Working"
git add -A
@'
Re-apply Add Part revive fix and job view layout/spacing changes

The previous commits for these files contained the old file contents.
- Add Part reuses a previously deleted part's number (revives the record).
- Job view: Attachments beside Send to PEX Inventory, PEX buttons in the
  standard section-button style, footer buttons no longer sit on the divider.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
