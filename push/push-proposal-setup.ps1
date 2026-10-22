cd "C:\Projects\Apollo X Working"
# Platform admin: proposal price list and wording moved from Settings to a new "Setup" sidebar tab below Proposals.
# No database change.
# Close the project files in your editor before running.
git add -A
@'
Platform: proposal setup moved to a "Setup" tab below Proposals, with a cleaner layout

- New sidebar item "Setup" (/platform/proposal-setup) directly under Proposals. The proposal price list and wording defaults moved here from Platform Settings, which now only holds the email (SMTP) settings.
- Re-laid out in three sections: Pricing (monthly fees, once-off fees, quote VAT and valid days, prepared by, with R / % / days units), Wording (included list, introduction letter and terms side by side) and Products and modules (a card per product with a module table: module, what it does, price per month, on by default).
- Save and Restore sample prices bars at the top and bottom; Save is only enabled when there are unsaved changes, with a marker when there are. Editing still needs the platform configuration permission.
- Proposals page text now points to Setup for the price list.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
