cd "C:\Projects\Apollo X Working"
# PEX Stock: Model shows machine / component model, custom columns, newest job first. No migration (uses the existing per-user column table).
git add -A
@'
PEX Stock: machine / component model, custom columns, newest job first

Model column now lists the machine model and the component model side by side, e.g. R1700G / C6.6 (just the one when only one is set). Search also matches the component model.

New Columns button (same as Jobs & WIP): Job #, Unit, Make, Model and Status are always shown and cannot be removed; each user can add Received, Original supply job, Machine serial, Component, Component type, Component serial, Part number, Job description, Supply date and Notes. Saved per user in the existing UserTableColumns table (table key pex-stock), API at /api/v1/pex/stock-columns. Default is the columns the table showed before.

The table is now sorted by Job # newest to oldest, comparing the trailing digits so BRE1000 comes before BRE999; units whose job has no number go last.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
