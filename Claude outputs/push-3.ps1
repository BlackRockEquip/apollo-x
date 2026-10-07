cd "C:\Projects\Apollo X Working"
git add -A
@'
Redesign Print Job History to match the new job card

- Page 1: logo and org details, large job number with job-type, status and extra tags,
  Date in / Previous job / Customer ref / Report number strip, Customer beside Machine /
  component, description, notes, Workshop beside Commercial & logistics (quote, sales order,
  invoice and PO put number and date on one row), then Warranty / PEX / Field service block
  when it applies.
- Page 2: Parts list and Outwork as banded tables with status tags and a compact header.
- Same fields as before, no activity history. Saved PDF copy uses the same layout helper.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
