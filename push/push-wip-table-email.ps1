cd "C:\Projects\Apollo X Working"
# Email button on the Jobs & WIP table + email template fields. NEW DATABASE MIGRATION: two nullable columns on CompanySettings.
# Close the project files in your editor before running.
git add -A
@'
Jobs & WIP: Email button (table as PDF) with editable email template

- Jobs & WIP: an Email button next to Print. It opens a small window asking who to send to (up to 5 addresses, remembers the last one) and an optional extra note, then emails the table exactly as it is on screen (filters, search and saved columns; ticked rows only if any are ticked) as a landscape PDF with the company letterhead. Sent through the company's own email settings. Not shown to the WIP View user.
- Settings > Templates: new "Jobs & WIP table email" section (subject and message, with placeholders title, company, date, count, filters). The signature is shared with the supplier emails. The Templates tab now shows for every company; the supplier (RFQ) templates still show only when RFQs is on.
- New columns CompanySettings.wipEmailSubject / wipEmailBody (migration 20261020150000_wip_table_email_templates).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
