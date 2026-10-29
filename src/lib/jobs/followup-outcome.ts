// Parts follow-up: what the result window says (2026-10-29, user request: "the
// error message is very small and almost unnoticeable, let it rather open a
// small dialog window for confirmation that the follow up was successful or
// there was a error"). Pure, so the wording is tested.

export type FollowupResult = { sent: { supplierName: string }[]; skipped: { supplierName: string; reason: string }[] };
export type FollowupOutcome = {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  message: string;
  // Optional second line under the message (what to do about it).
  detail?: string;
  sent: string[];
  skipped: { supplierName: string; reason: string }[];
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function followupOutcome(result: FollowupResult): FollowupOutcome {
  const sent = result.sent.map((s) => s.supplierName);
  const skipped = result.skipped;
  if (sent.length > 0 && skipped.length === 0) {
    return { tone: "success", title: "Follow-up sent", message: `The follow-up email was sent to ${plural(sent.length, "supplier")}.`, sent, skipped };
  }
  if (sent.length > 0) {
    return { tone: "warning", title: "Follow-up partly sent", message: `Sent to ${plural(sent.length, "supplier")}, but ${skipped.length} could not be sent.`, sent, skipped };
  }
  if (skipped.length > 0) {
    return { tone: "error", title: "Follow-up not sent", message: "No follow-up email was sent.", sent, skipped };
  }
  return { tone: "info", title: "Nothing to follow up", message: "There are no outstanding ordered parts on this job.", sent, skipped };
}

export function followupErrorOutcome(message: string, detail?: string): FollowupOutcome {
  return { tone: "error", title: "Follow-up failed", message: message || "Unable to send the follow-up.", ...(detail ? { detail } : {}), sent: [], skipped: [] };
}
