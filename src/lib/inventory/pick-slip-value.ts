// 2026-10-26, user request: Stock Levels > Picking Slip History gets an "Estimate Stock Price" column = the estimated stock value of
// the parts on the slip. Same basis as Stock Levels' "Total Stock Price": quantity x the part's cost price (Part.defaultPurchaseCost).
// It is an ESTIMATE: it uses the part's cost price as it is today, not the price at the moment of picking, and a part without a
// cost price counts as 0.
// Who sees the column (user request 2026-10-26): company admins, managers and stock controllers - and only if they may see cost prices
// at all (INVENTORY_VIEW_COST), so a company that took cost visibility away from one of these roles still hides it.
const VALUE_ROLES = new Set(["COMPANY_ADMIN", "MANAGER", "STORE_CONTROLLER"]);
export function canSeePickSlipValue(ctx: { tenantRole: string | null; tenantPermissions: Set<string> }): boolean {
  return ctx.tenantRole !== null && VALUE_ROLES.has(ctx.tenantRole) && ctx.tenantPermissions.has("INVENTORY_VIEW_COST");
}

type Num = { toString(): string } | string | number | null | undefined;

export type PickValueLine = { quantity: Num; part?: { defaultPurchaseCost: Num } | null };

export function estimatePickValue(lines: PickValueLine[]): string {
  let total = 0;
  for (const line of lines) {
    const qty = Number(line.quantity == null ? 0 : line.quantity.toString());
    const cost = Number(line.part?.defaultPurchaseCost == null ? 0 : line.part.defaultPurchaseCost.toString());
    if (Number.isFinite(qty) && Number.isFinite(cost)) total += qty * cost;
  }
  return (Math.round(total * 100) / 100).toFixed(2);
}
