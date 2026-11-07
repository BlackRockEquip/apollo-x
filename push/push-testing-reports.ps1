cd "C:\Projects\Apollo X Working"
# Testing Reports module + Testing Technician user type. NEW MIGRATIONS (2) - run before/while deploying: new module key, new user type, 2 new tables.
npx prisma migrate deploy
npx prisma generate
git add -A
@'
Testing Reports module and Testing Technician user type

- New module "Testing Reports": transmission dyno test sheets checked against the spec for the machine model as the readings are typed in. Live pass / fail on every reading, overall Pass / Fail / Pass with note, results kept with the job. Switched on per company from Platform > Companies > company > Industry build (Workshop build; Black Rock has it on). Off by default for other companies.
- New user type Testing Technician (Workshop companies). Access: Admins, Managers and Testing Technicians only. Admins and Managers can also change spec templates, reopen a completed test and delete a draft; a Testing Technician can start, fill in, complete and retest, and sees Testing Reports and nothing else (lands on it after login; no Jobs, customers, stock or settings access, and no customer names).
- Test sheet: autosave, Enter moves down the readings, limits checked as +/- tolerance, minimum, maximum, range, record-only and not-applicable rows, plus "P2 at most P1 minus 60" for P1/P2 sheets. A failing reading can be passed with a note and a reason, stamped with who and when. Completing needs every reading and at least one tester; completed tests are read-only until a manager reopens them. Retest starts a fresh sheet with the same limits, linked to the first.
- Spec templates (Admin / Manager): starter templates for CAT 777D, CAT R1700G and CAT 120K to 160K taken from the real sheets, editable; limits are copied onto each test so later template changes never alter old tests.
- Printed / PDF report in the new design (result box, fact strip, range bars, clutch table, company logo and details; no customer on the sheet).
- Job screen: new Testing tab listing the job's tests with a Start test button.
- Migrations 20261107100000_testing_reports_enums (module key, user type) and 20261107100100_testing_reports (enums, TestSpecTemplate, TestReport).
- Tests for the limit maths, the starter templates, the access rules and the service.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
