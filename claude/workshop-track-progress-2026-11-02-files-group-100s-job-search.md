# Workshop Track - progress 2026-11-02: Settings > Files grouped in 100s + job-number search (pr33)

**Request:** "settings/files - can folders be grouped in 100s? - add a search bar so a user can type the job number for the folder"

## What changed
- Settings > Files top level: job folders named like BRE1182 are grouped in hundreds ("BRE1100 - BRE1199"), newest group first. Each group row shows job-folder count, file count, size and an "Open group" button. Inside a group the folders are newest job first. RFQs / Support / Company stay listed below the groups. If every job folder fits in one hundred, no grouping (list as before). Another prefix (ENG...) gets its own groups.
- Path at the top keeps the group: All folders > BRE1100 - BRE1199 > BRE1182.
- Search box (Settings > Files only): type a job number or part of it (capitals/spaces ignored). Done on the server (DB query narrowed + folder filtered), so it works on very large storage. Exact number first, then "starts with", then "contains". Enter opens the best match; Escape / X clears; 300 ms debounce. Platform admin's "Everything on the server" view is filtered too.
- No database migration. API: `GET /api/v1/storage/folder?scope=company&search=BRE11` (search ignored inside a folder and for the job-page folder viewer).

## Files
`src/lib/storage/folder-level.ts` (groupJobFolders, filterByTopFolder, rankFoldersByTerm), `folder-view.ts` (search param + `search` in listing), `api/v1/storage/folder/route.ts`, `components/StorageFolderBrowser.tsx`, `globals.css` (sfv-search block), `tests/unit/folder-view.test.ts` (+13 tests; 49 across the three storage/job/email suites pass). Push: `push/push-files-group-search.ps1`.

## Notes / limits
- Group labels pad numbers to at least 3 digits (ENG000 - ENG099). Folders whose name has a long prefix before the digits (>12 chars, e.g. random ids) are treated as unnumbered.
- Search only looks at the top-level folder name (the job number), not file names.
- Group size is a constant (100) in `groupJobFolders`.
