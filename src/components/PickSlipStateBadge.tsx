import { PICK_SLIP_STATE_LABELS, PICK_SLIP_STATE_TONES, type PickSlipPickState } from "@/lib/inventory/pick-slip-state";

// 2026-11-06, user request: the status shown next to a pick slip - Awaiting picking / Partly picked / Picked (see lib/inventory/pick-slip-state.ts).
// Used by the job's "Generated pick slips" list and Stock Levels' Picking Slip History.
export function PickSlipStateBadge({ state, pickedLines, totalLines }: { state?: string | null; pickedLines?: number; totalLines?: number }) {
  if (state !== "AWAITING" && state !== "PARTLY" && state !== "PICKED") return <span>—</span>;
  const key = state as PickSlipPickState;
  const detail = key === "PARTLY" && typeof pickedLines === "number" && pickedLines > 0 && typeof totalLines === "number" ? ` (${pickedLines} of ${totalLines})` : "";
  return <span className={`status-pill tone-${PICK_SLIP_STATE_TONES[key]}`} title={key === "AWAITING" ? "Parts on this slip have not been marked received yet" : undefined}>{PICK_SLIP_STATE_LABELS[key]}{detail}</span>;
}
