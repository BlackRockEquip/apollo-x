import { NextResponse } from "next/server";

// 2026-09-16 — Notes moved to a single field on Job itself (see
// jobs/service.ts's updateJob and the `notes` field on jobUpdateInput),
// replacing the old add/edit/delete JobNote list this route used to
// serve via addJobNote/updateJobNote/deleteJobNote (both now removed
// from jobs/service.ts). Nothing in the app calls this route any more.
// Left in place (returning 410) rather than deleted, since this session
// has no way to delete files on disk — safe to delete this file by hand
// whenever convenient.
function gone() {
  return NextResponse.json(
    { error: { message: "This endpoint has been removed — job notes are now saved as part of the job itself." } },
    { status: 410 },
  );
}

export const POST = gone;
export const PATCH = gone;
export const DELETE = gone;
