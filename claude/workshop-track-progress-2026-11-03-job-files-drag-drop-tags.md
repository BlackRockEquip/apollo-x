# Workshop Track - progress 2026-11-03: Job Photos + Attachments drag and drop, tags (pr38)

**Request:** In a job, the Photos card: let a user drag and drop photos and add tags once loaded; the tag line stretches too far right. Then "do the same for the attachments card". Mockup first (Design canvas "Job photos and attachments card mockup"), then "great, build it".

## What changed
- Photos and Attachments each have a drop zone (drag several files, or Choose photos / Choose files, up to 8 MB each). Loaded files are listed with: photo thumbnail (or PDF/DOCX/XLSX badge), size, tag buttons, optional note, remove. "Tag all as ..." tags everything; "Add N photos / Upload N files" sends them in turn. A file that fails (wrong type etc.) stays with the server's reason; files over 8 MB, empty files and non-images in Photos are turned away straight away.
- In the list the tag is a small chip (no longer stretching); click to change / clear, "+ Add tag" when empty. Only the tag is sent, so the note is untouched.
- Tags: photos Before / After / Fault / Serial plate / Other; attachments Drawing / Quote / Certificate / Report / Other. Stored in the existing JobAttachment.tag text column - no migration.
- Tags now appear on every job type (before: field-service jobs only). View-only users no longer see the upload area.
- Server: `PATCH /api/v1/jobs/:id/attachments/:attachmentId` accepts `{tag}` and/or `{notes}`; a tag from the wrong list answers "That tag does not suit this kind of file." (INVALID_ATTACHMENT_TAG). Activity line "Attachment tag updated: file".

## Files
New: `lib/jobs/attachment-tags.ts`, `components/job-files/JobFileUploader.tsx`, `components/job-files/AttachmentTagChip.tsx`, `tests/unit/job-attachment-tags.test.ts` (10 tests pass).
Changed: `components/JobWorkspace.tsx` (old single-file form + upload function replaced), `app/globals.css` (jfu-*), `lib/jobs/validation.ts`, `lib/jobs/service.ts`, `lib/http/errors.ts`. Push: `push/push-job-files-drag-drop-tags.ps1`.

## Notes / limits
- Saved photos show a camera icon, not a thumbnail: the file endpoint returns the whole file as base64, so thumbnails would need a small thumbnail endpoint (not built).
- Files upload one after another (each is base64 in a JSON body, as before).
- The drop target is the upload area of each card (not the whole card).
- Checked in a browser harness (drag/drop, tag all, per-file tag, failed file, chip menu); the full Job screen was not run against a real database.
