// 2026-09-14 — DEAD ROUTE, safe to delete (couldn't delete it directly —
// this session has no file-delete capability on this machine, only
// read/write, so it's neutralized here instead; please remove this file
// and its now-empty "receive" folder by hand).
//
// This route called `receivePexReturn` from `src/lib/pex/service.ts`, which
// no longer exists — "receiving" a PEX return isn't a separate manual
// action anymore. It happens automatically now, the moment the linked
// PEX_RETURN job's own status stepper moves (e.g. reaching TO_STRIP maps to
// RECEIVED via `JOB_STATUS_TO_PEX_STATUS`/`syncPexStatusFromJobStatus` in
// pex/service.ts) — this is part of the same 2026-09-09 PEX redesign noted
// in the dated `PexRecord` model comment in prisma/schema.prisma (see also
// `requirePexWrite`'s comment there, which lists PEX_RETURN_RECEIVE among
// several now-unused dead permission names).
//
// Confirmed before neutralizing this: no client-side code calls this route
// — searched every component under src/components/ for a fetch referencing
// "pex-tracking/supply/.../receive"; the PEX supply/return UI in
// JobWorkspace.tsx already only targets the current jobs/[id]/pex/* and
// pex/[id]/* route families.
//
// Left with no exported HTTP method handlers below, so any request to this
// path now simply gets Next's default "no matching handler" response
// instead of a 500 from calling a function that doesn't exist.
//
// RETRY (2026-09-14, later the same day) — `npm run typecheck` still
// reported the old `receivePexReturn` import here after the fix above was
// supposedly committed. This route sits 8 folders below the repo root, one
// past this session's device-bridge staging depth limit (max 7), so that
// commit could only be confirmed via the `device_commit_files` response
// itself (no rejection reported) — it could not be re-staged and
// byte-verified like every other file in this engagement normally is. The
// same session separately hit (and confirmed, by retrying) a transient bug
// today where a `device_commit_files` call reported success but the
// content hadn't actually changed on a re-stage — so it's likely the same
// thing happened here, silently, on a file this session has no way to
// verify. This is a second, identical commit of the same `export {};` fix;
// please re-run typecheck to confirm it actually landed this time, and
// treat any repeat of this specific error as a sign this file needs to be
// checked by hand (or the connected folder moved one level down so it's
// within staging range).
export {};
