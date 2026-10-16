import type { ModuleKey } from "@prisma/client";

// ---------------------------------------------------------------------------
// 2026-10-16 — industry builds (see the "Industry builds — design decisions"
// doc in the project). A company is on one build; the build decides which
// module TILES the platform admin can switch on and off for it (Platform >
// Companies > company > Industry build). A tile is one switch in the UI that
// stands for one or more real module keys (the ones the rest of the app
// already checks via ctx.moduleAccess), so no check anywhere else in the app
// needs to know which build a company is on — it only asks "is this module
// on?".
//
// This file is pure data + tiny helpers (no database, no React) so the
// platform screen, the save service and the tests all read the same thing.
// ---------------------------------------------------------------------------

export const INDUSTRY_BUILD_IDS = ["WORKSHOP", "ENGINEERING"] as const;
export type IndustryBuildId = (typeof INDUSTRY_BUILD_IDS)[number];

export type BuildTile = {
  id: string;
  label: string;
  note: string;
  // The real module keys this tile switches. The first one is the "primary"
  // key: the tab reads a tile's licensing (state / source / dates) from it.
  modules: ModuleKey[];
  // Core tiles are always on, locked, and carry no licensing.
  core?: boolean;
  // Tile ids that must also be active for this one to work. A tile whose
  // requirement is off keeps the platform admin's choice but shows as
  // inactive ("requires …"); step B makes the access check respect it.
  requires?: string[];
};

export const TILES: Record<string, BuildTile> = {
  JOBS: { id: "JOBS", label: "Jobs & WIP", note: "Job cards, status, history, ETA checks", core: true, modules: ["JOBS_WIP", "WARRANTY", "REBUILDS", "QUOTES", "SALES_ORDERS", "INVOICES", "PAYMENTS"] },
  CUSTOMERS: { id: "CUSTOMERS", label: "Customers & suppliers", note: "Customer and supplier records", core: true, modules: ["CUSTOMERS", "SUPPLIERS"] },
  REPORTS: { id: "REPORTS", label: "Reports", note: "Operational reports", core: true, modules: ["REPORTS"] },
  DASHBOARD: { id: "DASHBOARD", label: "Dashboard, attachments, notifications", note: "Dashboard with Upcoming and Overdue ETA cards", core: true, modules: ["DASHBOARD", "NOTIFICATIONS", "ATTACHMENTS", "IMPORT_EXPORT"] },
  JOB_PARTS: { id: "JOB_PARTS", label: "Job parts & ordering", note: "Parts list on a job, ordering, Parts Outstanding, job kits", modules: ["JOB_PARTS", "JOB_KITS"] },
  RFQ: { id: "RFQ", label: "RFQ & supplier quotes", note: "Send RFQs, import and compare quotes", modules: ["PROCUREMENT"], requires: ["JOB_PARTS"] },
  STOCK: { id: "STOCK", label: "Stock levels", note: "Standalone inventory: catalog, bins, counts", modules: ["INVENTORY", "STORAGE"] },
  PICK_SLIPS: { id: "PICK_SLIPS", label: "Pick slips", note: "Issue stock from the shelf to a job", modules: ["PICK_SLIPS"], requires: ["JOB_PARTS", "STOCK"] },
  PEX: { id: "PEX", label: "PEX inventory", note: "PEX supply and return jobs, tracking", modules: ["PEX_STOCK", "PEX_TRACKING"] },
  OUTWORK: { id: "OUTWORK", label: "Outwork", note: "Jobs sent to other shops", modules: ["OUTWORK"] },
  FIELD_SERVICE: { id: "FIELD_SERVICE", label: "Field service", note: "Field service jobs and field report", modules: ["FIELD_SERVICE"] },
  SPECIFICATIONS: { id: "SPECIFICATIONS", label: "Specifications", note: "Dimensions, tolerances and spec notes, with before-work and after-work report uploads", modules: ["SPECIFICATIONS"] },
};

export type BuildDefinition = {
  id: IndustryBuildId;
  label: string;
  description: string;
  example: string;
  tiles: string[];
  // Optional tiles a NEW company on this build starts with (core tiles are
  // always granted). For Workshop this is exactly what a new company could
  // effectively use before industry builds existed.
  defaultOn: string[];
  wording: string[];
};

export const BUILDS: Record<IndustryBuildId, BuildDefinition> = {
  WORKSHOP: {
    id: "WORKSHOP",
    label: "Workshop Business",
    description: "Repair, rebuild and field service workshops that quote parts, issue pick slips and track components through the shop.",
    example: "Black Rock Equipment",
    tiles: ["JOBS", "CUSTOMERS", "REPORTS", "DASHBOARD", "JOB_PARTS", "RFQ", "STOCK", "PICK_SLIPS", "PEX", "OUTWORK", "FIELD_SERVICE"],
    defaultOn: ["JOB_PARTS", "RFQ", "OUTWORK", "FIELD_SERVICE"],
    wording: ["Job", "Component", "Pick slip", "Delivery note", "Mechanic"],
  },
  ENGINEERING: {
    id: "ENGINEERING",
    label: "Engineering Business",
    description: "Engineering shops that run work through the same job flow as a workshop, without PEX inventory, supplier RFQs or field service.",
    example: "Subset of the Workshop modules",
    tiles: ["JOBS", "CUSTOMERS", "REPORTS", "DASHBOARD", "JOB_PARTS", "STOCK", "PICK_SLIPS", "OUTWORK", "SPECIFICATIONS"],
    defaultOn: ["JOB_PARTS", "OUTWORK", "SPECIFICATIONS"],
    wording: ["Job", "Pick slip", "Delivery note"],
  },
};

export function isIndustryBuildId(value: unknown): value is IndustryBuildId {
  return typeof value === "string" && (INDUSTRY_BUILD_IDS as readonly string[]).includes(value);
}

export function buildTiles(build: IndustryBuildId): BuildTile[] {
  return BUILDS[build].tiles.map((id) => TILES[id]);
}

// Every module key that belongs to ANY tile of ANY build. Keys outside this
// set (none today) are never touched by the Industry build tab.
export function allManagedModules(): ModuleKey[] {
  const keys = new Set<ModuleKey>();
  for (const tile of Object.values(TILES)) for (const key of tile.modules) keys.add(key);
  return Array.from(keys);
}

// Module keys a brand-new company on this build is granted.
export function initialModuleKeys(build: IndustryBuildId): ModuleKey[] {
  const keys: ModuleKey[] = [];
  for (const tile of buildTiles(build)) {
    if (tile.core || BUILDS[build].defaultOn.includes(tile.id)) keys.push(...tile.modules);
  }
  return keys;
}

// A tile is "working" when it is on and everything it requires is working.
export function tileWorking(build: IndustryBuildId, tileId: string, on: (tileId: string) => boolean, seen: string[] = []): boolean {
  if (seen.includes(tileId)) return false;
  const tile = TILES[tileId];
  if (!tile || !BUILDS[build].tiles.includes(tileId)) return false;
  if (!tile.core && !on(tileId)) return false;
  return (tile.requires ?? []).every((id) => tileWorking(build, id, on, [...seen, tileId]));
}
