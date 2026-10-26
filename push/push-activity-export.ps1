cd "C:\Projects\Apollo X Working"
# Activity history export: company admin (Settings > Import/Export) and platform admin (company page). No migration.
git add -A
@'
Activity history export for company admins and platform admins

- Settings > Import/Export: new "Activity history" card. Choose Job activity, the System audit log, or both; export all jobs or search-and-tick specific jobs (by job number or customer); optional date range. Downloads one Excel workbook (an Export info sheet plus one sheet per chosen type). The audit log needs the Audit permission; credential-like fields in audit snapshots are hidden; times are South African time.
- Platform > Companies > (company): new "Activity history" card with a "Download activity history" button that exports that company's complete job activity and audit log. Needs the platform audit permission.
- Each download is recorded in the audit log. No database change.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
