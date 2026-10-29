cd "C:\Projects\Apollo X Working"
# Parts follow-up: result opens in a small dialog. No migration.
git add -A
@'
Parts follow-up: result and errors open in a small dialog

Clicking Follow up (or Send follow-up to outstanding suppliers) now opens a small window instead of a line of small text: "Follow-up sent" with the suppliers it went to, "Follow-up partly sent" listing what was and was not sent, "Follow-up not sent" with the reason per supplier (for example no email address on file), "Nothing to follow up", or "Follow-up failed" with the error (including email not set up). Close with OK, the X or by clicking outside. The wording is built in src/lib/jobs/followup-outcome.ts (tested).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
