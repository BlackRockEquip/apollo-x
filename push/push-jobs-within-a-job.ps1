cd "C:\Projects\Apollo X Working"
# Jobs within a job: each inside job (JobItem) gets its own job type. Has a migration (20261125130000_job_item_type) - it runs on deploy.
git add -A
@'
Jobs within a job: one job can hold a Field service job and a repair job (or any mix), each with its own job type

A job (one number, one customer, one set of notes) can now hold several jobs, and each one has its own job type. The type decides that job's steps, layout and printed document, so a field job and a workshop repair sit under one job number.

New Job: a Job type column on the list of jobs. Engineering keeps its "Items received" list (now with a type per row). Workshop stays an ordinary single job until "Add another job to this job" is pressed, which turns the machine card into the list. The first row is the job itself, so changing its type changes the job's type.

Job screen: Workshop jobs get a slim "Add job to this job" strip. Adding one moves the job's own machine and component details into job 1. Once there are two or more, the list of jobs, the Mixed status bar, tags (BRE1140-1, -2), item links for parts, outwork, photos and specifications, and the job filter all work as they do for Engineering items. Select a job to see its own layout: a field job shows the field layout (site, hours, Field report), a repair shows the workshop layout. With nothing selected and two kinds of job, each kind gets its own stepper. Changing a job's type puts it back at the first step of the new type's steps.

Status: each job is judged against its own steps; the whole job follows the job that is least far along its own steps and shows Mixed. A step clicked on the whole-job stepper only moves the jobs that have that step. Reopen puts a job of another type back at its own first step.

Rules: PEX jobs cannot hold other jobs. The job type of the whole job follows job 1. One Field report per job (shared by any field jobs inside it). Delivery notes per item stay Engineering only for now.

Jobs & WIP list: the Type column shows "Several" for mixed jobs, the job's rows show each job's type, and the count says "jobs" outside Engineering.

New nullable type column on JobItem (migration 20261125130000_job_item_type, no backfill: an item with no type follows the job's own type, so everything on file is unchanged).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
