cd "C:\Projects\Apollo X Working"
# Store Controller = Stock Levels (+ Manufacturers, Storage Locations), Pick slips, PEX Inventory only. Manager = everything except Settings. No migration.
git add -A
@'
Roles: Store Controller limited to Stock Levels, Pick slips and PEX Inventory; Manager gets everything except Settings

- Store Controller: Stock Levels (check, receive, issue, transfer, adjust, add/edit parts), Manufacturers and Storage Locations (bin locations), Pick slips, and PEX Stock / PEX Tracking (view only). No Dashboard, Jobs & WIP, Job Kits, Reports, Customers, Suppliers, finance or Settings. Deactivating parts, manufacturers and bins stays with company admins.
- Pick slips: the job list in the pick slip window now has its own lookup (needs the Pick slips module and the issue-stock permission), so a Store Controller can pick a job without having access to Jobs & WIP.
- Manager: view and edit access to every area except Settings (company, users, numbering, tax codes, commercial terms). Deactivate and delete stay with company admins, apart from the branch/contact/address deactivations a Manager already had.
- What each person sees is still narrowed by the modules switched on for that user and for the company.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
