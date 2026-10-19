import { EntitlementStatus, ModuleKey } from "@prisma/client";
import { BLACK_ROCK_INTERNAL_CODE } from "@/lib/constants";
import { BUILDS, TILES, allManagedModules } from "@/lib/builds/definitions";

// 2026-10-19, user request: "Spec sheet module should not be visible to workshop companies, i see it is visible on
// Black Rock company". Black Rock is a Workshop company whose modules come from this policy (always FULL) rather than
// from licence rows, so it used to get EVERY module key - including ones that only exist in another build (Specifications
// is Engineering-only). Black Rock now gets full access to everything except the modules that belong to a build tile
// its own build (Workshop) does not offer.
const BLACK_ROCK_EXCLUDED_MODULES = (() => {
  const offered = new Set<ModuleKey>(BUILDS.WORKSHOP.tiles.flatMap((tileId) => TILES[tileId].modules));
  return new Set<ModuleKey>(allManagedModules().filter((key) => !offered.has(key)));
})();

export type ModuleAccessMode = "FULL" | "READ_ONLY" | "DENIED";

export type EntitlementInput = {
  companyInternalCode: string;
  companyActive: boolean;
  module: ModuleKey;
  status?: EntitlementStatus;
  effectiveFrom?: Date;
  expiresAt?: Date | null;
  gracePeriodDays?: number | null;
  readOnlyOverrideUntil?: Date | null;
};

export function evaluateModuleAccess(input: EntitlementInput, now = new Date()): ModuleAccessMode {
  if (!input.companyActive) return "DENIED";
  if (input.companyInternalCode === BLACK_ROCK_INTERNAL_CODE) return BLACK_ROCK_EXCLUDED_MODULES.has(input.module) ? "DENIED" : "FULL";
  if (!input.status || !input.effectiveFrom || input.effectiveFrom > now) return "DENIED";

  if (input.status === "ACTIVE") {
    if (!input.expiresAt || input.expiresAt > now) return "FULL";
    const graceDays = input.gracePeriodDays ?? 30;
    const graceEnd = new Date(input.expiresAt.getTime() + graceDays * 86_400_000);
    return now <= graceEnd ? "READ_ONLY" : "DENIED";
  }

  if (input.status === "GRACE_READ_ONLY") return "READ_ONLY";
  if (input.readOnlyOverrideUntil && input.readOnlyOverrideUntil >= now) return "READ_ONLY";
  return "DENIED";
}
