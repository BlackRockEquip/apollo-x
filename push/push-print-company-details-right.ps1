cd "C:\Projects\Apollo X Working"
# Printed delivery note, outwork delivery note and field report: company details under the logo are right aligned. No migration.
git add -A
@'
Printouts: company details right aligned

On the printed job delivery note, outwork delivery note and field service report, the company name, address, VAT and contact lines under the logo were left aligned inside a right-hand block. They now line up on the right edge with the job number and date. Customer / supplier details stay as they were.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
