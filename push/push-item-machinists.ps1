cd "C:\Projects\Apollo X Working"
# Engineering: each job item can have its own Machinist 'Assess' / 'Final'.
# DATABASE CHANGE: migration 20261030090000_job_item_machinists (two nullable columns on JobItem). Applies on deploy (prisma migrate deploy);
# locally run:  npx prisma migrate deploy ; npx prisma generate
git add -A
@'
Engineering: each job item can have its own machinists, with Reassign machinist

A job carries one Machinist 'Assess' and one Machinist 'Final'. An item of a multi-item job can now have its own of each; a blank one follows the job's, so existing jobs are unchanged.

Item list: new Machinists column (Assess / Final, lighter text while the item follows the job). Selected item: shows both machinists ("from the job" when inherited) and a "Reassign machinist" button with two pickers ("Same as the job" clears the item's own). Edit item and the New Job screen's item rows have the same two pickers (once there are several items). Item changes are written to Activity ("Item BRE12-2 machinist changed. Machinist 'Assess': Piet -> Sipho."). The printed job card and its saved PDF list who works on each item. The Jobs & WIP list shows the machinists on each expanded item row. The job's own machinist boxes now say items follow them unless they have their own.

Database: JobItem.stripMechanicId / buildMechanicId (nullable, SetNull when a machinist is deleted), migration 20261030090000_job_item_machinists.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
