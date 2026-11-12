cd "C:\Projects\Apollo X Working"
# Testing sidebar: Transmissions, Engines, Brakes, Torque Converters. No migration.
git add -A
@'
Testing sidebar split by what is tested

- The Testing group now lists Transmissions (the existing test sheets, same address as before), Engines, Brakes and Torque Converters.
- Engines, Brakes and Torque Converters open a "coming soon" page that points to Transmissions; their test sheets are not set up yet.
- All four use the same Testing Reports module and Testing view permission, so Testing Technicians see them too.
- The page heading of the transmission test list now reads Transmissions.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
