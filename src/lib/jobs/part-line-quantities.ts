// 2026-10-05 — one place that works out how a job part line's quantity splits
// between "from shelf stock" and "from an outside supplier", shared by the
// server (pick slips, Mark received, supplier follow-up) and the parts table
// so they can never disagree. Pure numbers only, no Prisma, so it is safe to
// import from client components.
//
//   orderedQuantity   explicit number of units being ordered elsewhere (or
//                     null = not set).
//   ordered           what that works out to: the explicit number, otherwise
//                     "everything not already taken from stock" when the line
//                     has an order number or supplier, otherwise 0.
//   stockQty          quantity - ordered: the units to come from the shelf.
//   stockRemaining    stock units not yet taken off the shelf (taken off the
//                     shelf = stockIssuedQuantity, set when Mark received is
//                     clicked).
//   supplierOutstanding   units still to arrive from the supplier. For a line
//                     with no order information at all this is simply the
//                     unreceived quantity, as before.
//   toListOnPickSlip  units a new pick slip should still list.

export type PartLineQuantityInput = {
  quantity: unknown;
  orderedQuantity?: unknown;
  orderNumber?: string | null;
  hasSupplier?: boolean;
  receivedQuantity?: unknown;
  stockIssuedQuantity?: unknown;
  pickedQuantity?: unknown;
};

function num(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Quantities are Decimal(19,4) in the database; rounding to 4 places keeps
// float noise from turning "0" into 0.0000000001 in a comparison.
function r4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function partLineQuantities(input: PartLineQuantityInput) {
  const quantity = num(input.quantity);
  const received = num(input.receivedQuantity);
  const issued = num(input.stockIssuedQuantity);
  const picked = num(input.pickedQuantity);
  const hasOrderInfo = Boolean((input.orderNumber ?? "").toString().trim()) || Boolean(input.hasSupplier);
  const explicit = input.orderedQuantity === null || input.orderedQuantity === undefined ? null : num(input.orderedQuantity);

  const ordered = r4(Math.min(quantity, Math.max(explicit ?? (hasOrderInfo ? quantity - issued : 0), 0)));
  const stockQty = r4(Math.max(quantity - ordered, 0));
  const outstanding = r4(Math.max(quantity - received, 0));
  const stockRemaining = r4(Math.min(Math.max(stockQty - issued, 0), outstanding));
  const supplierReceived = Math.max(received - issued, 0);
  const supplierOutstanding = hasOrderInfo || explicit !== null
    ? r4(Math.max(Math.min(ordered - supplierReceived, outstanding), 0))
    : outstanding;
  const toListOnPickSlip = r4(Math.max(stockQty - Math.max(picked, issued), 0));

  return { quantity, hasOrderInfo, explicitOrdered: explicit, ordered, stockQty, outstanding, stockRemaining, supplierOutstanding, toListOnPickSlip, issued, picked, received };
}
