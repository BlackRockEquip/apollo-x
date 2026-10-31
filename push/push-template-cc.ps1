cd "C:\Projects\Apollo X Working"
# Templates: CC addresses per email template. NEW MIGRATION - run the migration before/while deploying (adds 3 nullable columns to CompanySettings).
npx prisma migrate deploy
npx prisma generate
git add -A
@'
Settings > Templates: CC addresses on each email template

- Quote request, Parts follow-up and Jobs & WIP table templates each get a CC box (comma / semicolon separated, up to 10). Those addresses are copied on every email sent from that template. Invalid addresses are flagged under the box and block saving; the preview shows a Cc line.
- Anyone already on the To line is not copied again. Saved tidy (lower case, no repeats); empty = nobody copied.
- Migration 20261031090000_email_template_cc: three nullable columns on CompanySettings (rfqEmailCc, followupEmailCc, wipEmailCc).
- Tests for reading, validating, saving and sending the CC list.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
