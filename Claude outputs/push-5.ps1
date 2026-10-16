cd "C:\Projects\Apollo X Working"
# ETA dashboard cards for everyone + Job kits with their own part entry.
# Run the database migration afterwards with your usual process (prisma migrate deploy).
git add -A
@'
ETA dashboard cards for every company, and Job kits with their own way to enter parts

- Dashboard: new "Overdue ETAs" and "Upcoming ETAs" cards for every industry build (core Jobs & WIP, not a module).
  They read the job's Mechanic ETA date; jobs with no Mechanic ETA are ignored. Upcoming = today through the next 7 days.
  Overdue = ETA date before today on a job that is not finished (finished = ready to deliver or later, closed or cancelled).
  Each card lists the five nearest jobs, each row opens the job. Both can be switched off or reordered under Customize dashboard.
- Job kits: a kit line now has its own part number and description (catalog link is optional).
  Without Stock levels the catalog is never used: lines are typed, pasted (part number, qty, description) or imported.
  With Stock levels on, a typed number that matches a catalog part links to it as before and the stock check on apply still runs.
  A number already on the kit is topped up instead of duplicated. Applying a kit adds plain "to order" part lines when Stock levels is off.
- Migration: JobKitLine.partId becomes optional; partNumber and description columns added and filled from the catalog for existing lines.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
