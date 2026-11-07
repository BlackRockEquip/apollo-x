// ---------------------------------------------------------------------------
// Pick slip "picked or awaiting picking" status (2026-11-06, user request: "when pickslips are created in jobs and the
// parts picked, can a status next to pickslip show that the pickslip is picked or awaiting picking?").
//
// A pick slip is a list of what to fetch from the shelf; stock only comes off the shelf when each part is marked received
// on the job's Parts list (see part-line-quantities.ts, stockIssuedQuantity). So nothing new is stored: a slip counts as
// picked as its parts are marked received. Pure numbers/ids only (no Prisma) so the server list and tests share it.
//
//   Awaiting picking  no line on the slip has been picked yet
//   Partly picked     some, not all
//   Picked            every line
//
// Lines whose stock was already taken when the slip was made (Stock Levels' own picking, and slips made before 2026-10-05,
// which carry a stock movement or no part line at all) count as picked straight away.
// When one part line is on several slips, the units taken off the shelf are given to the oldest slip first.
// ---------------------------------------------------------------------------

export type PickSlipPickState = "AWAITING" | "PARTLY" | "PICKED";

export const PICK_SLIP_STATE_LABELS: Record<PickSlipPickState, string> = {
  AWAITING: "Awaiting picking",
  PARTLY: "Partly picked",
  PICKED: "Picked",
};

export const PICK_SLIP_STATE_TONES: Record<PickSlipPickState, string> = {
  AWAITING: "amber",
  PARTLY: "blue",
  PICKED: "green",
};

export type SlipLineInput = {
  id: string;
  createdAt: Date | string;
  jobPartLineId: string | null;
  quantity: unknown;
  stockMovementId?: string | null;
};

export type PartLineInput = {
  id: string;
  status: string;
  stockIssuedQuantity?: unknown;
};

function num(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function r4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function time(value: Date | string): number {
  const t = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// How many units of each slip line are picked. `slipLines` must hold every (non-deleted) slip line that points at the part
// lines in question, not just the slips being shown, so the oldest-first hand-out is the same on every page.
export function pickedUnitsBySlipLine(slipLines: readonly SlipLineInput[], partLines: readonly PartLineInput[]): Map<string, number> {
  const partById = new Map(partLines.map((p) => [p.id, p]));
  const picked = new Map<string, number>();
  const byPartLine = new Map<string, SlipLineInput[]>();
  for (const line of slipLines) {
    const quantity = num(line.quantity);
    const part = line.jobPartLineId ? partById.get(line.jobPartLineId) : undefined;
    // Stock taken when the slip was made, or no part line to follow: picked.
    if (!part || line.stockMovementId) {
      picked.set(line.id, quantity);
      continue;
    }
    byPartLine.set(part.id, [...(byPartLine.get(part.id) ?? []), line]);
  }
  for (const [partLineId, lines] of byPartLine) {
    const part = partById.get(partLineId)!;
    // A fully received line has everything in hand, whichever way it arrived.
    let available = part.status === "RECEIVED" ? Number.POSITIVE_INFINITY : num(part.stockIssuedQuantity);
    for (const line of [...lines].sort((a, b) => time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id))) {
      const take = Math.min(num(line.quantity), available);
      picked.set(line.id, r4(take));
      available -= take;
    }
  }
  return picked;
}

export function pickSlipPickState(lines: ReadonlyArray<{ id: string; quantity: unknown }>, picked: ReadonlyMap<string, number>): { state: PickSlipPickState; pickedLines: number; totalLines: number } {
  let pickedLines = 0;
  let anyUnits = false;
  for (const line of lines) {
    const units = picked.get(line.id) ?? 0;
    if (units > 0) anyUnits = true;
    if (units + 0.00005 >= num(line.quantity)) pickedLines += 1;
  }
  const totalLines = lines.length;
  const state: PickSlipPickState = totalLines > 0 && pickedLines === totalLines ? "PICKED" : anyUnits ? "PARTLY" : "AWAITING";
  return { state, pickedLines, totalLines };
}
