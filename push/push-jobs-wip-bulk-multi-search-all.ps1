cd "C:\Projects\Apollo X Working"
# Jobs & WIP: header checkbox fix, bulk update of several fields at once (jobs stay ticked), search across every job field. No migration.
git add -A
@'
Jobs & WIP: select-all checkbox no longer overlapped, bulk "Update fields" in one go, search looks through every field

- The sticky header (Select all) now sits above the row tick boxes when the table scrolls.
- Bulk bar: one "Update fields" dialog changes status, purchase order status and payment date received together (any combination, or clear the payment date). The jobs stay ticked afterwards, and the chosen values stay in the dialog, so another update can follow straight away. Close / cancel / send to PEX behave as before.
- Search: the Jobs & WIP search now matches customer (name, trading name, account code), job (type, status, references, report / plant / tracking numbers, notes, sales rep, machinists), machine and component details, commercial (quote, sales order, invoice, PO numbers and PO status, delivery type/transport, machine hours) and the dates as shown in the table. Fields behind a column permission are searched only for viewers who may see that column. The server-side search (very large lists) covers the same fields.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
