// 2026-11-11, user request: "look at the warranty module as an addon to a job type and not on its own, as some warranty jobs can be
// field related and some come into the workshop". Warranty is a tickbox on a job ("Is warranty"), not a job type of its own. The job type
// keeps deciding the status flow, the job card and the layout; the tickbox only adds the Warranty tab and the Warranty pill.
//
// Pure helpers (no database, no React) so the rules are tested on their own and shared by the server and the job screen.

/** Job types that can be a warranty job. PEX supply / PEX return / Outright sale have no warranty claim, so they never show the tickbox. */
export const WARRANTY_ELIGIBLE_TYPES = ["STANDARD_REPAIR", "PARTIAL_REPAIR", "FIELD_SERVICE"] as const;

export function canBeWarranty(type: string | null | undefined): boolean {
  return (WARRANTY_ELIGIBLE_TYPES as readonly string[]).includes(String(type ?? ""));
}

/**
 * The job type and warranty flag to save for what a client sent.
 *  - The retired "WARRANTY" job type (an old client, an import) becomes a Standard repair with the flag on.
 *  - The flag is only ever on for a type that can be warranty; for any other type it is forced off.
 */
export function normalizeWarranty(type: string, isWarranty: boolean | null | undefined): { type: string; isWarranty: boolean } {
  if (type === "WARRANTY") return { type: "STANDARD_REPAIR", isWarranty: true };
  return { type, isWarranty: canBeWarranty(type) && isWarranty === true };
}

/** A job counts as a warranty job when the flag is on, or when it is still saved with the retired Warranty type (before the migration ran). */
export function jobIsWarranty(job: { type?: string | null; isWarranty?: boolean | null } | null | undefined): boolean {
  return !!job && (job.isWarranty === true || job.type === "WARRANTY");
}
