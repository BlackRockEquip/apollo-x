cd "C:\Projects\Apollo X Working"
# Tech Training module. NEW MIGRATIONS (2): module key + notification types, then 17 new Training* tables.
# No new dependencies (mammoth, pdf-parse and pdf-lib are already in package.json).
npx prisma migrate deploy
npx prisma generate
npx vitest run tests/unit/tech-training-model.test.ts tests/unit/tech-training-markdown.test.ts
git add -A
@'
Tech Training module: courses, employee register, quizzes, approved certificates, ISO 9001 records

- New module "Tech Training" (ModuleKey TECH_TRAINING), switched on per company from Platform > Companies > company >
  Industry build (Workshop and Engineering builds; off for new companies). Sidebar group "Tech Training".
- Permissions: TRAINING_VIEW (every user type takes courses), TRAINING_APPROVE / TRAINING_CONTENT_EDIT / TRAINING_REPORTS_VIEW
  (Managers and Company Admins), TRAINING_EMPLOYEES_MANAGE and TRAINING_SETTINGS (Company Admins only).
- Employees: Company Admins create profiles (Name, Surname, ID number, Position, Email); SA ID check, ID masked for everyone
  else (POPIA), position = required courses, manager = certificate approver, linked Flo X login, enrol in required training.
- Learner: catalogue, course page, lesson reader (text, text + diagrams, PDF, video link), safety points to confirm,
  pre-assessment, chapter knowledge checks, final quiz, read-and-acknowledge courses, mentor questions, revision cards.
  Start date/time (first lesson), end date/time (quiz passed), active time and every quiz attempt are recorded.
- Approvals: passing creates a pending certificate; the employee's manager or a Company Admin approves or sends it back
  (never their own; escalates after N working days). Practical sign-offs, mentor answers, 30-day effectiveness reviews.
- Certificates carry the logo of the employee's own company (Settings > Company) and the approver's signature; PNG, PDF,
  print; verify by number. Revoke with reason.
- Course manager: Draft -> In review -> Published -> Archived (restore); minor/major changes with "What changed", history and
  roll back; delete only never-published drafts. Text lesson editor with quiz builder. Add material: write, import Word /
  PDF / text, import the Service Tech Training folder, copy a course. The 7 Cat Basics courses ship in training-seed/.
- Records and ISO: per-employee competence record + audit trail (print / PDF pack), training matrix, controlled documents,
  ISO 9001 7.2 / 7.5 / 9.3 / 10.2 controls, corrective actions, CSV exports (matrix, competence, SETA list, audit).
- Migrations 20261128120000_tech_training_enum and 20261128120100_tech_training. Tests: tech-training-model, tech-training-markdown.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oWtPeuuUwXHEar7AgS
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
