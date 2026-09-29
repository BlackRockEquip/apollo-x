cd "C:\Projects\Apollo X Working"
git add -A
@"
Fix SMTP test connection hanging with no feedback on unreachable host/port

User report on Render staging: "the test connection just runs but nothing
happens." Root cause: nodemailer's defaults (connectionTimeout 2min,
greetingTimeout 30s, socketTimeout 2min) were untouched, so a wrong host
or a firewalled port -- most commonly port 25, which Render (like most
PaaS providers) blocks outbound -- produced no response at all for up to
2 minutes before failing, and the button had no client-side timeout
either, so it looked like it silently did nothing.

- lib/email.ts: verifySmtpConnection now sets 12s connection/greeting/
  socket timeouts, so a bad host/port/blocked-port fails fast with a real
  error message instead of hanging. sendEmail's own transporter (real RFQ
  sends) deliberately keeps the longer defaults.

- CompanySettingsForm.tsx: the Test connection button now aborts after
  20s as a safety net either way, with a specific message pointing at
  port 25 commonly being blocked (use 587 or 465 instead) and to check
  the security setting matches the port.

No schema change in this batch -- just the two files above.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
