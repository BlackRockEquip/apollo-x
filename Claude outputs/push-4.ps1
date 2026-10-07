cd "C:\Projects\Apollo X Working"
git add -A
@'
PEX supply status follows job delivery status; fix PEX View history

- A PEX Supply record now moves to "Awaiting core" when the supply job reaches Delivered
  awaiting payment (or Complete/Closed), not only when a Delivery date is filled in. One shared
  rule (pexSupplyDeliveredStatus) is used on create, save, status change and unlink.
- View history: the endpoint now opens for anyone who can see the job (PEX Stock, PEX Tracking
  or Jobs view), a missing record returns a proper error instead of a crash, and the previous
  jobs walk no longer stops at an earlier job that is not a linked PEX record - it lists that
  job and keeps following its Previous job number.
- scripts/repair-pex-supply-delivered.ts fixes records already stuck (dry run by default).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
