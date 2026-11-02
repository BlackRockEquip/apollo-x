# Workshop Track - progress note 2026-11-02 - Job number in the address; View folder

Requests: "when I create a job, the link is not the job number - can it be the new job number?" and "is there a way to view what is on the server folders? like a button that says view folder?" (answers: button on each job AND in Settings; company users see files filed by the system, platform admin sees everything on the server).

## Job address
- Jobs open at `/jobs/BRE1182`. `jobs/[id]/page.tsx` resolves the address part as a job number (case-insensitive, within the company) or an id (`lib/jobs/route-key.ts`); an id address redirects to the job-number address (query string kept), so old bookmarks / emails / notifications / the ~90 existing `/jobs/${id}` links keep working.
- Jobs list rows and the redirect after creating a job use `jobHref()` (`lib/jobs/job-href.ts`) directly. Other pages still link by id and rely on the redirect (one extra hop) - can be switched over later.
- A job without a number keeps its id address. If a job's number is edited later, a bookmark with the old number stops matching (id links still work).

## View folder
- `lib/storage/folder-view.ts`: `listStorageFolder` / `getStorageFileUrl`; pure helpers in `folder-level.ts`; API `GET /api/v1/storage/folder` and `/folder/file` (5-minute signed link).
- Company users: files Apollo X filed (Attachment records, status COMMITTED). Job scope needs Jobs & WIP read + JOBS_VIEW and is not available to the mechanic (USER) or WIP View user; Settings > Files needs COMPANY_SETTINGS_VIEW. A job view cannot be pointed at another folder.
- Platform admin (PLATFORM_COMPANIES_EDIT): "Everything on the server" reads the real folder / bucket via the new `StorageBackend.listObjects` (local folder, dev storage, S3/R2/B2); shows stray files (not filed by Apollo X) and flags filed files missing from the server; stray files can be opened only by platform admins.
- UI: `components/StorageFolderBrowser.tsx` (`ViewFolderButton` in the job's Attachments header, `StorageFolderBrowser` on `/settings/files`), nav item "Files" in `settings-nav.ts`.
- No migration. Tests: `job-route-key.test.ts`, `folder-view.test.ts`.
- Not tested against a real bucket / real server folder (walk tested on a temp folder; S3 listing unrun).
