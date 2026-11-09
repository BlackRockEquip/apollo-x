cd "C:\Projects\Apollo X Working"
# Testing Reports: printed report matches the mockup, company-name-only footer, logo waits to load, Pass based on comments. No migration.
git add -A
@'
Testing Reports: printed report like the mockup, company-name footer, Pass based on comments

- Printed / PDF report now follows the approved mockup: black top bar, logo with the yellow DYNO TEST REPORT tag, machine name with a result tile, fact strip, test data cards and a clutch table with segmented spec-window bars (green window, marker for the reading, red when out of spec), comments and tested by, yellow bottom bar.
- Footer shows only the company name (address, reg and VAT lines removed).
- Logo fix: the print dialog now opens once the logo has loaded (it used to print before the logo arrived and showed a grey box).
- Result tile stays short: one headline plus up to three reasons, then "and N more out of spec".
- New: Pass based on comments. When readings are out of spec the tester can write the reason in Comments and pass the test (needs at least 5 characters). Recorded as Pass with note, with who passed it and when; the out-of-spec readings stay marked on the sheet and the comments print with the report. Complete test still records a Fail.
- Tests for passing on comments (needs a reason, still needs every reading, ignored when nothing is out of spec, normal Fail unchanged).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
