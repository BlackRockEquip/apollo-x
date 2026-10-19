cd "C:\Projects\Apollo X Working"
# Store Controller can see and manage Manufacturers and Storage Locations (bin locations). No migration.
git add -A
@'
Store Controller: Manufacturers and Storage Locations (bin locations) now visible in Inventory

- Fix: a Store Controller with Stock Levels switched on did not see Manufacturers or Storage Locations in the Inventory menu (and could not open the pages). Both screens need their own view permission, which the Store Controller role never had. The role now has view, add and edit for both; deactivate stays with company admins. Other roles are unchanged.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
