cd "C:\Projects\Apollo X Working"
git add -A
@'
Job screen: a delivered job no longer shows its ETA as overdue

The ETA (and Scheduled, on field service) in the facts strip only treated Closed, Cancelled and Complete as finished, so a job at Delivered awaiting payment with a past ETA still said "1 day overdue". It now uses the same rule as the dashboard Overdue ETA card, the WIP column and the board (To be delivered or later, or flagged Return unrepaired), through a shared isEtaFinished helper in lib/jobs/ui.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
