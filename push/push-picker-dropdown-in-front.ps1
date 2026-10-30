cd "C:\Projects\Apollo X Working"
# Machinist / sales rep dropdown list now shows in front of the cards below it. CSS only, no migration.
git add -A
@'
Job screen: machinist and sales rep dropdown lists now appear in front of the cards below

The type-ahead list opened behind (and was clipped by) the next card. The card or field grid holding an open list is now lifted above its neighbours and allowed to overflow, so the whole list is visible: Job details fields, Edit item, Reassign machinist and the New Job item rows. CSS only.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
