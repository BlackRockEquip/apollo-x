cd "C:\Projects\Apollo X Working"
# Parts follow-up refuses with a clear error when email is not set up; Compare quotes export highlights the preferred supplier. No migration.
git add -A
@'
Parts follow-up email error; Compare quotes export highlights preferred supplier

Parts follow-up: clicking Follow up (or Send follow-up to outstanding suppliers) when the company has no email set up now shows a bold red error next to the button ("Email isn't set up for this company yet ...") and sends/records nothing, instead of listing each supplier as skipped. The server refuses too (EMAIL_NOT_CONFIGURED, 409).

Compare quotes export: the preferred supplier for each line (the staged pick in the dialog, else the saved one) is filled gold in the Excel file across its unit / total / availability cells, with a note under the table; both the Excel and CSV files get a trailing "Preferred supplier" column, since CSV cannot carry colour. The Excel file is now written by a small built-in writer (src/lib/files/xlsx-lite.ts) because the SheetJS community build cannot write cell styles; the CSV and Excel rows come from one shared builder (src/lib/jobs/quote-comparison-export.ts).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
