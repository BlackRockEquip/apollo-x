import { Prisma } from "@prisma/client";

export type StockState = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "RESERVED" | "PARTIALLY_RESERVED" | "INACTIVE_PART";

// Derived label only — never stored. Priority: an inactive part is flagged
// first, then physical exhaustion, then full/partial reservation, then the
// configurable low-stock threshold. "RESERVED" means nothing is physically
// available (all on-hand stock is reserved), not that the part is active-only.
export function deriveStockState(input: {
  onHand: Prisma.Decimal | string | number;
  reserved: Prisma.Decimal | string | number;
  threshold?: Prisma.Decimal | string | number | null;
  partActive: boolean;
}): StockState {
  if (!input.partActive) return "INACTIVE_PART";
  const onHand = new Prisma.Decimal(input.onHand);
  const reserved = new Prisma.Decimal(input.reserved);
  if (onHand.lte(0)) return "OUT_OF_STOCK";
  const available = onHand.minus(reserved);
  if (available.lte(0)) return "RESERVED";
  if (reserved.gt(0)) return "PARTIALLY_RESERVED";
  if (input.threshold != null && new Prisma.Decimal(input.threshold).gt(0) && onHand.lte(new Prisma.Decimal(input.threshold))) return "LOW_STOCK";
  return "IN_STOCK";
}

export const STOCK_STATE_LABEL: Record<StockState, string> = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
  RESERVED: "Fully Reserved",
  PARTIALLY_RESERVED: "Partially Reserved",
  INACTIVE_PART: "Inactive Part",
};

export const STOCK_STATE_CLASS: Record<StockState, string> = {
  IN_STOCK: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  LOW_STOCK: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  OUT_OF_STOCK: "bg-red-500/15 text-red-300 border-red-500/30",
  RESERVED: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  PARTIALLY_RESERVED: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  INACTIVE_PART: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};
