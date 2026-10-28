// PEX Stock table - which columns it can show (2026-10-28, user request:
// "allow a user to select custom columns like job wip, job#, Unit, Make, Model,
// Status these are not removable, a user can only add to it"). Plain data only,
// no prisma, so the client-side picker can import it; the saving lives in
// stock-columns-service.ts. Same one-row-per-user-per-table storage as the
// Jobs & WIP columns (UserTableColumns), under its own table key.

export const PEX_STOCK_TABLE_KEY = "pex-stock";

export type PexStockColumnId =
  | "jobNumber"
  | "unit"
  | "make"
  | "model"
  | "status"
  | "received"
  | "supplyJob"
  | "machineSerial"
  | "component"
  | "componentType"
  | "componentSerial"
  | "partNumber"
  | "jobDescription"
  | "supplyDate"
  | "notes";

export type PexStockColumnDef = { id: PexStockColumnId; label: string; locked?: boolean; defaultVisible?: boolean };

// Catalogue order is also the left-to-right order on the table.
export const PEX_STOCK_COLUMNS: PexStockColumnDef[] = [
  { id: "jobNumber", label: "Job #", locked: true, defaultVisible: true },
  { id: "unit", label: "Unit", locked: true, defaultVisible: true },
  { id: "make", label: "Make", locked: true, defaultVisible: true },
  { id: "model", label: "Model", locked: true, defaultVisible: true },
  { id: "status", label: "Status", locked: true, defaultVisible: true },
  { id: "received", label: "Received", defaultVisible: true },
  { id: "supplyJob", label: "Original supply job", defaultVisible: true },
  { id: "machineSerial", label: "Machine serial" },
  { id: "component", label: "Component" },
  { id: "componentType", label: "Component type" },
  { id: "componentSerial", label: "Component serial" },
  { id: "partNumber", label: "Part number" },
  { id: "jobDescription", label: "Job description" },
  { id: "supplyDate", label: "Supply date" },
  { id: "notes", label: "Notes" },
];

const VALID_IDS = new Set<string>(PEX_STOCK_COLUMNS.map((c) => c.id));
const LOCKED_IDS: PexStockColumnId[] = PEX_STOCK_COLUMNS.filter((c) => c.locked).map((c) => c.id);
export const PEX_STOCK_DEFAULT_COLUMNS: PexStockColumnId[] = PEX_STOCK_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);

// Keeps real ids only, always includes the five locked columns, and returns
// everything in catalogue order whatever order it was submitted in.
export function normalizePexStockColumns(raw: unknown): PexStockColumnId[] {
  const requested = Array.isArray(raw) ? raw.filter((v): v is PexStockColumnId => typeof v === "string" && VALID_IDS.has(v)) : [];
  const selected = new Set<PexStockColumnId>([...LOCKED_IDS, ...requested]);
  return PEX_STOCK_COLUMNS.filter((c) => selected.has(c.id)).map((c) => c.id);
}

export function pexStockColumnLabel(id: PexStockColumnId): string {
  return PEX_STOCK_COLUMNS.find((c) => c.id === id)?.label ?? id;
}

// The Model column lists the machine model and the component model side by
// side, e.g. "R1700G / C6.6". With only one of them it shows just that one.
export function pexModelText(machineModel?: string | null, componentModel?: string | null): string {
  const machine = (machineModel ?? "").trim();
  const component = (componentModel ?? "").trim();
  if (machine && component) return `${machine} / ${component}`;
  return machine || component || "";
}
