cd "C:\Projects\Apollo X Working"
# Industry builds, step B. No database migration in this step.
git add -A
@'
Industry builds, step B: menus, pages and actions follow the module switches

- Parts, Outwork and the RFQs tab now follow their own modules (Job parts & ordering, Outwork, RFQ & supplier quotes)
  instead of the Jobs & WIP licence; the sidebar, pages and the actions behind them are all checked on the server.
- Part-line, outwork, field-service, pick-slip, RFQ and parts-outstanding actions check their own module.
  Creating a Field service or PEX job needs that module.
- A module whose requirement is off is unavailable: RFQ needs Job parts & ordering; Pick slips need Job parts & ordering
  and Stock levels. A requirement in licence grace (read-only) caps the dependent at read-only. Black Rock is unchanged.
- Dashboard: Outstanding parts follows Job parts & ordering; Procurement / outwork shows when RFQ or Outwork is on.
- Job screens (hiding sections and buttons, part-line wording) come in step C.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
