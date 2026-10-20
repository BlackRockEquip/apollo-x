cd "C:\Projects\Apollo X Working"
# New customer window on the job screen now has the full address fields (no database change).
# Close the project files in your editor before running.
git add -A
@'
New customer window on the job screen uses the full address fields

- Adding a customer from inside a job now shows the same address fields as New customer on the Customers screen: Address type, Address line 1, Address line 2, City, Province, Postal code (instead of one Address line and City).
- All of them are saved on the new customer's address.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
