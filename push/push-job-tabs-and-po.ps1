cd "C:\Projects\Apollo X Working"
# Jobs within a job: tabbed layout and a customer PO for each job. Has a migration (20261125210000_job_item_po) - run `npx prisma migrate deploy` then `npx prisma generate`.
git add -A
@'
Jobs within a job: one tab per job, and each job can have its own customer PO

Job screen: a job that holds several jobs now shows a tab bar instead of the stacked list. The first tab is Overview: one card per job with its colour, a progress bar for its own steps, its status (changeable), customer PO, ETA and people, plus Open job, Edit and Add another job. Each job has its own tab showing its tag, job type and status; opening it shows only that job (its own stepper, layout, parts, outwork, photos and history). With two kinds of job and none open, the stacked steppers are replaced by a one-line hint, since every card shows its own progress. A job added from the tab bar opens on its own tab straight away. Remove job is on the selected job's details card. Print tags and Delivery note stay on the tab bar. Engineering keeps its item table.

New Job: when a workshop or field job has another job added, the list becomes the same tabs. One tab per job shows its type and whether it is Ready or Empty; the open tab holds that job's own fields (type, customer PO, component, machine, ETAs, machinists, work requested). Add job is the last tab; Duplicate and Remove are on the open tab.

Customer PO per job: new nullable customerPo on JobItem. A job with no PO of its own works under the job's PO (the "default"), so nothing on file changes. It can be typed when creating or adding a job, edited on a job, and is shown on the Overview cards, the selected job's details and the Jobs & WIP expanded rows. The Jobs & WIP Customer PO column lists every PO of a job that has several, and the search finds a job by any of its jobs' POs.

Not done in this change: printed documents (job card, delivery note) still print the job's own PO; the Print and Move buttons stay in the page header rather than inside each tab.

New nullable customerPo column on JobItem (migration 20261125210000_job_item_po, no backfill).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
