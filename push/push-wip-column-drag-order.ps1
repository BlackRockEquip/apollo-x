cd "C:\Projects\Apollo X Working"
# Jobs & WIP: drag to rearrange the columns in the Columns dialog. No migration.
git add -A
@'
Jobs & WIP: drag to rearrange columns

The Columns dialog now has a grip handle beside each shown column; drag it (mouse or touch) or focus it and press the up/down arrows to set the left-to-right order of the table. Job # stays first. Unticked columns sit under "Not shown" and are added to the end of the list when ticked. The order is saved to the user's account with the selection. normalizeJobsWipColumns now keeps the submitted order instead of re-sorting into catalogue order; selections saved before this were already in catalogue order so they look the same.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
