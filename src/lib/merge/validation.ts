import { z } from "zod";

// Merge Customer / Merge Supplier — new 2026-09-14, at the user's request
// ("Create merge client/supplier buttons on respective page"). The user's
// own choice of behavior: reassign everything from the losing record to
// the surviving one, then deactivate (never delete) the loser — see
// src/lib/merge/service.ts.
export const mergeInput = z
  .object({
    survivingId: z.string().cuid(),
    losingId: z.string().cuid(),
  })
  .refine((v) => v.survivingId !== v.losingId, { message: "Pick two different records to merge.", path: ["losingId"] });
