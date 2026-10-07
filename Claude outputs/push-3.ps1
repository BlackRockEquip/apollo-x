cd "C:\Projects\Apollo X Working"
git add -A
@'
Redesign Print Job Card as a mechanic-instructions sheet

- A4 card: company logo/name, large job number and job-type tag, Date in / Previous job /
  Customer ref-PO strip, machine and component in two columns, job description, notes and a
  lined space for the mechanic's findings, with Mechanic / Date lines in the footer.
- Per job type: Partial repair ("Agreed scope of repair"), Warranty (status tag, warranty
  block, "Cause of failure / findings"), PEX supply/return (PEX status tag and PEX block),
  jobs sent to PEX Inventory get a Pex tag, Outright sale has no findings space.
- No parts, outwork, barcode, ETAs, mechanics, customer name or prices.
- New "lined" PDF block so the saved PDF copy matches the printed card.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
