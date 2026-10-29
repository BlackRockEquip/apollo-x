cd "C:\Projects\Apollo X Working"
# Parts follow-up result dialog: refined look (from the approved mockup). No migration.
git add -A
@'
Parts follow-up result dialog: tidier spacing and a professional look

Built from the approved mockup: a coloured icon tile (red / green / amber), the blue "Parts follow-up" label, a bold title with a one-line summary, a card per supplier under "Sent to" and "Not sent" with count badges, even 24px padding, rounded corners with a softer shadow, and a light grey footer with the gold OK button. The "email not set up" failure shows one tinted box with the reason in bold and what to do underneath. followup-outcome.ts gains an optional detail line.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
