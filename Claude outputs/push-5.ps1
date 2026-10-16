cd "C:\Projects\Apollo X Working"
# Industry builds, step C. No database migration in this step.
git add -A
@'
Industry builds, step C: the job screen follows the module switches

- Parts list, Pick slips, RFQ buttons, Outwork and Field service on a job hide when their module is off.
  If the job already holds records from that module they stay visible but read-only.
- New job / job type dropdown only offers Field service and PEX types when those modules are on.
- Stock levels off: part lines read "To be ordered" until a supplier name or order number is entered, then "Ordered".
  No stock lookup, reservation, stock split or from-stock receiving for those lines.
- Pick slips are not loaded when the Pick slips module is off. "Send to PEX Inventory" needs the PEX module.
- Module access is now available to screens through the same context as the user's permissions.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
