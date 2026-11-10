cd "C:\Projects\Apollo X Working"
# Fix: brands (and payment terms / tax codes) not listed when editing or adding a supplier. No migration.
git add -A
@'
Fix: brands not listed when editing a supplier

- The Brands tab (and the payment term and default tax code drop-downs) on the supplier / customer New and Edit forms asked the list API for 200 rows at a time. The API allows at most 100, rejected the request, and the silent catch left the list empty ("No manufacturers on file yet").
- The lists now load every page at the allowed size, so all active brands show (also when a company has more than 100), and payment terms and tax codes show again.
- A brand a supplier is already linked to stays visible and removable even if that manufacturer was deactivated afterwards.
- If the brand list cannot load, the Brands tab now shows the reason instead of an empty list.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
