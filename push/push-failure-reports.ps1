cd "C:\Projects\Apollo X Working"
# Failure Reports module. NEW DEPENDENCY (pptxgenjs - builds the PowerPoint in the browser) and NEW MIGRATIONS (2):
# new module key, 3 new tables. npm install updates package.json and package-lock.json so Render's `npm ci` picks it up.
npm install pptxgenjs@3.12.0 --save
npx prisma migrate deploy
npx prisma generate
git add -A
@'
Failure Reports module: the Failure Report Builder as an Apollo module, linked to jobs

- New module "Failure Reports" (ModuleKey FAILURE_REPORTS): the Failure Report Builder (github.com/BoshoffGP/failure-report-builder,
  v8) rebuilt inside Apollo. Switched on or off per company from Platform > Companies > company > Industry build (Workshop and
  Engineering builds; off for new companies; Black Rock licensed). Uses the job permissions: JOBS_VIEW to see, JOBS_EDIT to make
  and change reports.
- Screens: /failure-reports (sidebar Jobs > Failure Reports): every report, newest first, search, cover thumbnail, Open / Copy /
  Delete; New report linked to a job or blank. /failure-reports/[id]: Job details, Photos and Findings on one page, saved as you
  type; Create Report builds the .pptx in the browser with the builder's exact layout and downloads it. /failure-reports/profiles:
  company profiles (logo with trim, accent / dark colours, pick colours from logo, header style, details, footer) kept per
  company - our own profile is made from the company settings the first time.
- Linked to a job: job number, client, component, serial (component's, else machine's), make, model, plant number, date of
  delivery (date received at the workshop), repair type (job type) and artisan (strip mechanic) are pulled in; Site and the
  warranty outcome are never filled from the job. Every field stays editable. Refresh from job updates untouched fields and asks
  before replacing changed ones; Link to a job / Unlink. A made report is saved in the job's files (tag Report) and the job gets
  a Failure reports tab with its reports and New failure report.
- Photos: many at once (downsized to 1600 px), drag or up / down to reorder, description per photo, damage marks (arrow, circle,
  box, text; yellow / red / white; three thicknesses; undo; rotate), 1-4 photos per page, own heading beside the photos.
  Findings: comments plus REPLACE / REPAIR / MISSING lists. Earlier values offered as suggestions while typing.
- Migrations 20261125200000_failure_reports_enum and 20261125200100_failure_reports. New dependency pptxgenjs 3.12.0.
- Tests: failure-reports-model (job mapping per the user's decisions, refresh from job, page count, marks, module wiring).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oWQMSgA2rwfJEsDMsg
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
