cd "C:\Projects\Apollo X Working"
git add -A
@"
Add supplier email templates, SMTP test connection, RFQ retry feedback

- Settings > Templates (new tab): edit the RFQ-request and parts-follow-up
  supplier emails, plus a shared signature, using {{supplierName}},
  {{jobNumber}}, {{machine}}, {{partsList}} placeholders. Leaving a field
  blank keeps the existing hardcoded wording -- nothing changes for a
  company that never opens this tab. The "from" address/name stay on
  Company / Branding (shown read-only here for reference) since that's
  SMTP transport config, not message content.

- Settings > Company / Branding: added a "Test connection" button next to
  the SMTP section's Configured/Not configured pill. Opens and
  authenticates against the mail server (no email sent) and shows the
  real failure reason -- bad login, wrong host, connection refused, etc.
  -- instead of only finding out the SMTP details are wrong when a real
  RFQ email fails to send.

- Job > RFQ table: clicking Retry on a failed/skipped request now shows a
  clear success/failure banner and a spinner on that row, instead of
  silently reloading with no feedback. Also added specific error messages
  for the three ways a retry can't go through (supplier already quoted,
  supplier has no email on file, email not configured for this company)
  -- these used to fall through to a generic "could not be completed"
  error.

- Job parts list: the "In stock: N" line (added in the previous session)
  now shows under the Status field instead of under the part
  number/description.

Includes a new Prisma migration (20260929120000_supplier_email_templates)
-- 5 new nullable columns on CompanySettings for the templates above. Runs
automatically on the next deploy via the existing migrate-on-build step;
no manual DB action needed.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
