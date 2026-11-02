cd "C:\Projects\Apollo X Working"
# Job address = job number, and View folder (job page + Settings > Files). No database migration.
git add -A
@'
Job pages open at the job number (/jobs/BRE1182); View folder shows the files on the server

- Job address: a job opens at /jobs/<job number> instead of the long id. Old links (id addresses, bookmarks, emails, notifications) still work and move to the job-number address. Jobs list and the redirect after creating a job use the job number directly. Job numbers are matched case-insensitively inside the signed-in company.
- View folder button (job page, Attachments section): lists the files in the job's folder on the server - saved documents, uploads, RFQ quotes - with size, date, who filed them and Open.
- Settings > Files: the company's whole storage location (a folder per job, RFQs, Support, Company), click into any folder.
- Company users see the files Apollo X filed. Flo X platform administrators also get "Everything on the server": the real folder / bucket is read, so files not filed by the system show ("Not filed by Apollo X") and filed files that are gone are flagged ("Missing on the server").
- Storage backends can list a folder (local folder, development storage, S3-compatible / R2 / B2); symbolic links skipped, results capped.
- Tests: job address resolution, folder levels, access rules, listing and opening files.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
