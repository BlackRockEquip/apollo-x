cd "C:\Projects\Apollo X Working"
git add -A
@"
Send to PEX Inventory: available at any status, Admins/Managers only

User request: make the convert-to-PEX-stock button visible no matter
what status the job is in (a unit mid-repair can still become PEX
stock), and restrict it to Admins and Managers.

Status: the button and allocateJobToPexInventory used to require
Delivered - awaiting payment. Now allowed at any status once the unit
is physically in the workshop. PEX Stock already lists in-repair units
under "To be repaired", and redeployment only ever matches units whose
job is COMPLETE, so an in-repair unit can't be handed out by accident.
Still blocked: DRAFT, TO_BE_COLLECTED, TO_BE_RECEIVED (the unit hasn't
arrived, and PEX Stock hides TO_BE_RECEIVED returns, which would bring
back the "allocated but not showing" problem) and CANCELLED. The UI
check and the server check use the same list.

Who: gated on PEX_STOCK_TRANSFER_IN, an existing but unused permission
whose name already means this. Admins have it (all permissions) and it
is now in the default Manager set; it can still be granted or removed
per user in Settings > Users. Previously the action needed
PEX_SUPPLY_CREATE, which Managers never had, so they couldn't use the
button at all. The server enforces it, not just the button.

Changed: src/components/JobWorkspace.tsx, src/lib/pex/service.ts,
src/lib/auth/permissions.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
