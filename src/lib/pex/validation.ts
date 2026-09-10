import { z } from "zod";

const longText = z.string().trim().max(4000).optional().nullable();

// PEX Stock (Apollo X's page/route name) shows ModApp's "PEX Inventory"
// content — units that have physically come back and aren't out on a job
// yet. ModApp's own /pex-inventory page has no status filter at all (just
// search + per-column client filters) — this adds one anyway, matching
// every other Apollo X list page's own search+status convention, scoped to
// the two states the page's stat cards already group by.
export const pexInventoryListQuery = z.object({
  q: z.string().trim().max(120).default(""),
  status: z.enum(["ALL", "READY", "TO_BE_REPAIRED"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// PEX Tracking shows ModApp's "PEX Units" content — every PEX record with a
// supply leg, full cycle history. Same "add a status filter Apollo X's
// other list pages have, that ModApp's own /pex page doesn't" reasoning as
// above.
export const pexTrackingListQuery = z.object({
  q: z.string().trim().max(120).default(""),
  status: z.enum(["ALL", "TO_BE_DELIVERED", "AWAIT_CORE", "OUTSTANDING", "RECEIVED", "IN_REPAIR", "COMPLETED", "SCRAPPED"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const pexUnlinkedReturnJobsQuery = z.object({
  q: z.string().trim().max(120).default(""),
});

export const pexLinkReturnJobInput = z.object({
  returnJobId: z.string().cuid(),
});

export const pexScrapInput = z.object({
  reason: z.string().trim().min(2).max(500),
});

export const pexNotesUpdateInput = z.object({
  notes: longText,
});
