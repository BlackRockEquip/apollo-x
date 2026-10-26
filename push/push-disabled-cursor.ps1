cd "C:\Projects\Apollo X Working"
# Disabled buttons / uploads show the standard "not allowed" cursor instead of the spinning "wait" cursor, system-wide.
# No database change.
# Close the project files in your editor before running.
git add -A
@'
Disabled buttons and uploads: standard not-allowed cursor system-wide

- A Save button with nothing to save (or busy) no longer shows the spinning "wait" cursor on hover; it shows the standard "not allowed" cursor.
- One global rule covers every disabled button, input, select, textarea, fieldset-disabled control and disabled upload buttons (labels wrapping a disabled file input). Enabled controls are unchanged.
- Primary, gold and section-action buttons: their own wait cursor replaced.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
