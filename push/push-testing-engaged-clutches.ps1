cd "C:\Projects\Apollo X Working"
# Testing Reports: gears with a different number of engaged clutches. NEW MIGRATION (1): adds one value to the TestLayout enum.
npx prisma migrate deploy
npx prisma generate
git add -A
@'
Testing Reports: gears with a different number of engaged clutches

- New template layout "Engaged clutches per gear". Name the clutches of the transmission once (C1, C2, ...), then give each gear only the clutches that are engaged in it, each with its own limit. One gear can have two readings and the next four (up to 12).
- Template editor: clutch name chips, a gear list with "Add clutch to this gear", limit type per clutch. Switching an existing Forward / Reverse or P1 / P2 template to the new layout turns the two columns into two named clutches and keeps the limits; switching back keeps the first two.
- Test sheet: each gear shows one reading box per engaged clutch with its limit and live pass / fail; Enter moves along the gear and on to the next. Each clutch can be passed with a note.
- Printed report: the clutch table lists each gear with only its engaged clutches, with the spec-window bar and the reading.
- Readings and the result, failure sentences and the 'Pass based on comments' flow work per clutch ("3rd, C4: 325, maximum 310 (15 over)").
- Existing Forward / Reverse and P1 / P2 templates and all existing tests are unchanged (no data is rewritten).
- Migration 20261109100000_testing_layout_engaged (one enum value).
- Tests for the maths, the template rules and saving readings per engaged clutch.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
