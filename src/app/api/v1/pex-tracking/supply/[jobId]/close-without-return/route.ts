// 2026-09-14 — DEAD ROUTE, safe to delete (couldn't delete it directly —
// this session has no file-delete capability on this machine, only
// read/write, so it's neutralized here instead; please remove this file
// and its now-empty "close-without-return" folder by hand).
//
// This route called `closePexReturnWithoutCore` from `src/lib/pex/service.ts`,
// which no longer exists — that whole "close a return without a core
// coming back" workflow was removed in the 2026-09-09 PEX redesign (see the
// dated `PexRecord` model comment in prisma/schema.prisma, and the
// `requirePexWrite` comment in pex/service.ts, which lists
// PEX_RETURN_RECEIVE among several now-unused dead permission names). There
// is no current equivalent action at all — a unit that never comes back
// just stays in AWAIT_CORE/OUTSTANDING indefinitely, or gets scrapped via
// `scrapPexRecord` if someone decides to write it off, which is a
// different operation.
//
// Confirmed before neutralizing this: no client-side code calls this route
// — searched every component under src/components/ for a fetch referencing
// "pex-tracking/supply/.../close-without-return"; the PEX supply/return UI
// in JobWorkspace.tsx already only targets the current
// jobs/[id]/pex/* and pex/[id]/* route families.
//
// Left with no exported HTTP method handlers below, so any request to this
// path now simply gets Next's default "no matching handler" response
// instead of a 500 from calling a function that doesn't exist.
export {};
