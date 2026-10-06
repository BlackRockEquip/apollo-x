cd "C:\Projects\Apollo X Working"
git add -A
@'
Field service jobs: new job page layout, site details, split hours, work performed, Field Report print

- Field service jobs get their own layout: Customer & site, Work requested,
  Field service, Photos & attachments, Outwork and a tabbed Parts card
  (Parts list / Pick slips / Follow-up) in the main column; Notes, Commercial &
  logistics and Activity history in a sidebar. Other job types are unchanged.
- New job fields: site contact name and phone, site address, access / induction
  notes (also on the create-job form for field jobs).
- Field service: scheduled date, hours worked normal / overtime / travelled with a
  calculated total, findings, work done, recommendations and follow-up visit.
  These autosave like every other field on the job page.
- Attachments can be tagged Before / After / Fault / Serial plate / Other.
- "Print Field Report" replaces "Print job card" on field jobs (print and saved
  PDF); its title is editable under Document titles.
- Database migration 20261006120000_field_job_fields.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
