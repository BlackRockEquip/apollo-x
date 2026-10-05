cd "C:\Projects\Apollo X Working"
# For your LOCAL copy after pulling this change, run once:  npm install   (adds pdf-lib)
#   then  npx prisma migrate dev  and  npm run prisma:generate   (new migration 20261005150000_storage_move_and_document_titles)
# The deployed site applies the migration with your usual migrate step. Optional: set STORAGE_ENCRYPTION_KEY on the server.
# Left over from the earlier Parts/Outwork sidebar change (harmless if already gone)
if (Test-Path "src\components\SuppliersTabNav.tsx") { Remove-Item "src\components\SuppliersTabNav.tsx" }
git add -A
@"
Storage: move all files to the chosen location, import exports, encrypt secret, job folders, saved PDF documents, document titles

User request: move all attachments / RFQs / support attachments to the chosen
folder; allow import of exported files so they open again on a new location;
encrypt the secret; create a folder per job (e.g. BRE1122) holding every
created/uploaded file; saved documents named "<job number> - <document>"
(e.g. BRE1152 - Job History); Org Admin > Configuration tab to change each
document title. Answers: saved documents are PDFs, saved with a separate
"Save to folder" button (printing does nothing extra), everything under the job.

- Files: job attachments, RFQ request/quote files, general RFQ files and
  support attachments are written to the company's storage location
  (job files in <JOB NUMBER>/, job-less RFQs in RFQs/, support in
  Support/<ticket>/, logo in Company/). New uploads go straight there when a
  location is set; bytes columns are now nullable, storedAttachmentId links the
  row to its stored file. Readers use the stored copy, else the old DB bytes.
- Move files to this storage (Platform > Companies > [company] > Storage
  location): copies existing DB files into the layout above in batches,
  verifying each by read-back before clearing the DB copy; safe to re-run.
- Import exported files: upload the export .zip (mirrors the folder layout) and
  files are matched by path, then file name + size, written to the new location
  and verified; idempotent. Export zip now uses the folder layout + richer manifest.
- Secret encryption: storage secret access keys are AES-256-GCM encrypted
  (STORAGE_ENCRYPTION_KEY, else derived from DATABASE_URL); legacy plaintext is
  still read and upgraded on first use; unreadable secrets give a clear message.
- Job folders: a folder named after the job number is created when the job is
  created (real folders; bucket providers create it with the first file).
- Document titles: Org Admin > Configuration > Document titles (Job Card, Job
  History, Delivery Note, Pick Slip, Parts List, Outwork Delivery Note). The
  title is the print heading and the saved file name.
- Save to folder: new button beside each Print renders the document as a PDF on
  the server (company letterhead + logo, pdf-lib) and saves it as
  "<JOB NUMBER> - <title>.pdf" in the job folder and the job's Attachments;
  repeat saves get " (2)". Outwork delivery notes add " - <supplier>".
- Migrations: 20261005150000_storage_move_and_document_titles.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
