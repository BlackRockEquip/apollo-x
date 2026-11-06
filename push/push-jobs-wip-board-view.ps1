cd "C:\Projects\Apollo X Working"
# Jobs & WIP: Board view next to the table. No migration. Close these files in your editor before running.
git add -A
@'
Jobs & WIP: Board view (cards in stage lanes) next to the table, Table stays the default

- New Table | Board switch beside the search box; the choice is remembered per browser (cookie), the table is the default.
- Board lanes: Receiving, Quote and approval, Workshop, Parts and outwork, Delivery (Field service / Completed / Other only when a job is in them). "Every status" splits them into one lane per status.
- Cards show job #, job type, customer (only for users who may see customers), component and machine, status pill, Breakdown / Return unrepaired / Pex pills, item count, machinist/mechanic and ETA. Past the Mechanic/Machinist ETA = red "Nd late" chip. Late jobs come first in each lane.
- Board filters: Late only, Mechanic/Machinist, Job type, Show completed (completed hidden by default). The page search box and any header filter / dashboard link still drive the board (it follows the table's visible rows). Auto refresh keeps working.
- View-only WIP users see the board but cards do not open the job.
- No drag-to-move yet (agreed as a later step). No migration.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
