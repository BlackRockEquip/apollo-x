cd "C:\Projects\Apollo X Working"
# Adding parts is type or paste only (file import removed); Compare quotes gets an Availability column.
# HAS A MIGRATION (prisma/migrations/20261027130000_rfq_quote_line_lead_time): Render applies it on deploy.
git add -A
@'
Add parts: type or paste only. Compare quotes: Availability column

Adding parts to a job no longer has the import parts list file option or the template download. The box takes typed or pasted parts, read leniently: commas, tabs or spaces, "x2", a line with only a part number adds 1, a pasted heading row is ignored. Lines that cannot be used stay in the box with a note.

Compare quotes: new Availability column. Importing a quote file reads the supplier's lead time for each part (STOCK, 7 DAYS, 10-14 Days, AVAILABLE IMMEDIATELY, 5 TO 10 WORKING DAYS, Babcock's in stc / pdc notes) into one short phrase the person can edit. It shows in the price entry screen, under each price in Compare prices, and in the CSV and Excel exports. New column JobRfqQuoteLine.leadTime (migration).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
