cd "C:\Projects\Apollo X Working"
# Job > Parts list > Bulk update: "Send to Outwork" button. No migration.
git add -A
@'
Parts list bulk update: Send to Outwork

When parts are ticked in Bulk update, a new "Send to Outwork (n)" button opens the Record outwork sheet with one line per selected part (part number - description, quantity) already filled in. Pick the supplier and date sent out and record it as usual. Lines already typed on that sheet are kept and a part already listed is not added twice. Only shown to users with full Outwork access (hidden for view-only users). On the tablet layout it opens the Outwork sheet. After the outwork is recorded the bulk selection is cleared.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
