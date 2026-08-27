import { EntitlementStatus, ModuleKey } from "@prisma/client";
import { BLACK_ROCK_INTERNAL_CODE } from "@/lib/constants";

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
  if (input.companyInternalCode === BLACK_ROCK_INTERNAL_CODE) return "FULL";
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
