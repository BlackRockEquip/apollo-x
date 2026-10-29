cd "C:\Projects\Apollo X Working"
# Compare quotes: Mark all N/A for a supplier that did not quote. No migration.
git add -A
@'
Compare quotes: "Mark all N/A" when a supplier did not quote

In the Compare quotes entry dialog there is now a bar under the supplier name: "Did <supplier> not quote this job?" with a Mark all N/A button. It sets N/A on every line that has no price typed (lines already priced are left alone) and a Clear all N/A button puts them back to blank. Nothing is stored until Save this supplier, as before. The line counts come from naBarCounts in compare-model.ts (tested).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
