cd "C:\Projects\Apollo X Working"
# Suppliers / Customers: "Clone to customer" / "Clone to supplier" button on each row. No database change.
# Close the project files in your editor before running.
git add -A
@'
Suppliers and Customers: clone a record to the other list

- Each row on the Suppliers page has a "Clone to customer" button and each row on the Customers page has "Clone to supplier". It asks first, then creates a new, independent record and offers a link to open it.
- It is a copy: the original is untouched. Copied: name, account code, registration and VAT numbers, telephone, email, website, notes, payment terms, currency, plus the active addresses and contacts.
- Not copied: a customer's trading name, credit limit, tax code and on-hold flag; a supplier's brands and "can receive RFQs" ticks; anything linked to the original (jobs, outwork, RFQs, branches).
- Refused if the other list already has an active record with the same name. The account code is only copied when it is free in the other list.
- Needs permission to create in the other list (Customers or Suppliers) and the module licensed. New route POST /api/v1/master-data/[kind]/[id]/clone; audit events written for the new record and its addresses and contacts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
