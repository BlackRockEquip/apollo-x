cd "C:\Projects\Apollo X Working"
# Fix: CEP (Capital Equipment Parts) PDF quote imported no prices. No migration.
git add -A
@'
Fix price import from PDF quotes that store each character separately

- Fix: the Capital Equipment Parts PDF quote read no prices. That PDF stores every character as its own piece of text, so the reader split part numbers and prices into single characters. Characters that sit right next to each other are now joined back into whole cells before prices are read. PDFs that already had whole cells are unchanged.
- Items the supplier marks Unavailable (R 0.00) no longer get their weight offered as a price.
- When the same part number is quoted on more than one line (for example 1 off from stock and 6 off in 3 hours), the line matching the quantity on the parts list is used.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
