import { EntitlementSource, EntitlementStatus, ModuleKey, Prisma, Product } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { BLACK_ROCK_INTERNAL_CODE } from "@/lib/constants";
import { BUILDS, INDUSTRY_BUILD_IDS, TILES, initialModuleKeys, type IndustryBuildId } from "@/lib/builds/definitions";

// ---------------------------------------------------------------------------
// 2026-10-16 — Industry build tab (Platform > Companies > company).
//
// Reads and writes the same CompanyModuleEntitlement rows the rest of the app
// already uses to decide what a company can open: a module is "on" for a
// company when it has a row there, "inactive" when it has none. The tab just
// groups the module keys into tiles (src/lib/builds/definitions.ts) and saves
// the whole tab in one transaction, with the same history + audit trail the
// old one-module-at-a-time form left.
// ---------------------------------------------------------------------------

const PRODUCT: Product = "WORKSHOP";

export type TileLicensing = {
  status: EntitlementStatus;
  source: EntitlementSource;
  effectiveFrom: string; // YYYY-MM-DD
  expiresAt: string | null; // YYYY-MM-DD
};

export type TileState = { active: boolean; licensing: TileLicensing };

export type CompanyIndustryBuildState = {
  companyId: string;
  build: IndustryBuildId;
  // Black Rock is protected: its modules come from an immutable internal
  // policy, so the tab is read-only for it.
  protected: boolean;
  builds: Array<{
    id: IndustryBuildId;
    label: string;
    description: string;
    example: string;
    wording: string[];
    tiles: Array<{ id: string; label: string; note: string; core: boolean; requires: string[] }>;
  }>;
  // Keyed by tile id, for every tile of every build, so the tab can preview a
  // different build without another round trip.
  tiles: Record<string, TileState>;
};

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function requireCompanyView(ctx: RequestContext) {
  requirePlatformPermission(ctx, "PLATFORM_COMPANIES_VIEW");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
}

export async function getCompanyIndustryBuild(ctx: RequestContext, companyId: string): Promise<CompanyIndustryBuildState> {
  requireCompanyView(ctx);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      internalCode: true,
      industryBuild: true,
      entitlements: { where: { product: PRODUCT }, select: { module: true, status: true, source: true, effectiveFrom: true, expiresAt: true } },
    },
  });
  if (!company) throw new Error("RESOURCE_NOT_FOUND");
  const isProtected = company.internalCode === BLACK_ROCK_INTERNAL_CODE;
  const byModule = new Map(company.entitlements.map((row) => [row.module, row]));
  const today = ymd(new Date());

  const tiles: Record<string, TileState> = {};
  for (const tile of Object.values(TILES)) {
    const row = byModule.get(tile.modules[0]);
    const inWorkshop = BUILDS.WORKSHOP.tiles.includes(tile.id);
    const active = isProtected ? inWorkshop : tile.core ? true : tile.modules.some((module) => byModule.has(module));
    tiles[tile.id] = {
      active,
      licensing: isProtected
        ? { status: "ACTIVE", source: "INTERNAL_FREE", effectiveFrom: today, expiresAt: null }
        : {
            status: row?.status ?? "ACTIVE",
            source: row?.source ?? (tile.core ? "BUNDLE" : "PLAN"),
            effectiveFrom: row ? ymd(row.effectiveFrom) : today,
            expiresAt: row?.expiresAt ? ymd(row.expiresAt) : null,
          },
    };
  }

  return {
    companyId: company.id,
    build: company.industryBuild,
    protected: isProtected,
    builds: INDUSTRY_BUILD_IDS.map((id) => ({
      id,
      label: BUILDS[id].label,
      description: BUILDS[id].description,
      example: BUILDS[id].example,
      wording: BUILDS[id].wording,
      tiles: BUILDS[id].tiles.map((tileId) => {
        const tile = TILES[tileId];
        return { id: tile.id, label: tile.label, note: tile.note, core: Boolean(tile.core), requires: tile.requires ?? [] };
      }),
    })),
    tiles,
  };
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const saveSchema = z.object({
  build: z.enum(INDUSTRY_BUILD_IDS),
  tiles: z.record(
    z.string(),
    z.object({
      active: z.boolean(),
      licensing: z
        .object({
          status: z.nativeEnum(EntitlementStatus),
          source: z.nativeEnum(EntitlementSource),
          effectiveFrom: day,
          expiresAt: day.nullable().optional(),
        })
        .optional(),
    }),
  ),
  reason: z.string().trim().max(300).optional(),
});

export type SaveIndustryBuildInput = z.input<typeof saveSchema>;

export async function saveCompanyIndustryBuild(ctx: RequestContext, companyId: string, raw: unknown) {
  requirePlatformPermission(ctx, "PLATFORM_ENTITLEMENTS_MANAGE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const input = saveSchema.parse(raw);
  for (const tileId of Object.keys(input.tiles)) if (!TILES[tileId]) throw new Error("INDUSTRY_BUILD_UNKNOWN_TILE");
  const build = input.build;
  const targetTiles = new Set(BUILDS[build].tiles);
  const reason = input.reason?.trim() || `Industry build tab (${BUILDS[build].label})`;

  const summary = await prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { id: true, internalCode: true, industryBuild: true } });
    if (!company) throw new Error("RESOURCE_NOT_FOUND");
    if (company.internalCode === BLACK_ROCK_INTERNAL_CODE) throw new Error("BLACK_ROCK_ENTITLEMENT_PROTECTED");

    const rows = await tx.companyModuleEntitlement.findMany({ where: { companyId, product: PRODUCT } });
    const byModule = new Map(rows.map((row) => [row.module, row]));
    const now = new Date();
    let created = 0;
    let updated = 0;
    let removed = 0;

    for (const tile of Object.values(TILES)) {
      const requested = input.tiles[tile.id];
      const inBuild = targetTiles.has(tile.id);
      const wasOn = tile.modules.some((module) => byModule.has(module));
      // Core tiles are always on. Optional tiles follow the request, or stay
      // as they are when the request leaves them out. A tile the new build
      // does not offer is switched off.
      const wantOn = tile.core ? true : inBuild ? (requested ? requested.active : wasOn) : false;
      const licensing = !tile.core && wantOn ? requested?.licensing : undefined;
      if (licensing?.expiresAt && licensing.expiresAt < licensing.effectiveFrom) throw new Error("EXPIRY_BEFORE_START");

      for (const module of tile.modules) {
        const existing = byModule.get(module);
        if (wantOn) {
          const desired = {
            status: licensing?.status ?? existing?.status ?? ("ACTIVE" as EntitlementStatus),
            source: licensing?.source ?? existing?.source ?? ((tile.core ? "BUNDLE" : "PLAN") as EntitlementSource),
            effectiveFrom: licensing ? parseDay(licensing.effectiveFrom) : (existing?.effectiveFrom ?? now),
            expiresAt: licensing ? (licensing.expiresAt ? parseDay(licensing.expiresAt) : null) : (existing?.expiresAt ?? null),
          };
          if (!existing) {
            await tx.companyModuleEntitlement.create({ data: { companyId, product: PRODUCT, module, ...desired, gracePeriodDays: null } });
            created += 1;
          } else if (
            existing.status !== desired.status ||
            existing.source !== desired.source ||
            existing.effectiveFrom.getTime() !== desired.effectiveFrom.getTime() ||
            (existing.expiresAt?.getTime() ?? null) !== (desired.expiresAt?.getTime() ?? null)
          ) {
            await tx.companyModuleEntitlement.update({ where: { id: existing.id }, data: desired });
            updated += 1;
          } else {
            continue;
          }
          await tx.entitlementHistory.create({
            data: {
              companyId,
              product: PRODUCT,
              module,
              previousStatus: existing?.status ?? null,
              newStatus: desired.status,
              source: desired.source,
              effectiveAt: desired.effectiveFrom,
              expiresAt: desired.expiresAt,
              reason,
              changedById: ctx.userId,
            },
          });
        } else if (existing) {
          await tx.companyModuleEntitlement.delete({ where: { id: existing.id } });
          removed += 1;
          await tx.entitlementHistory.create({
            data: {
              companyId,
              product: PRODUCT,
              module,
              previousStatus: existing.status,
              newStatus: "EXPIRED",
              source: existing.source,
              effectiveAt: now,
              expiresAt: now,
              reason: `Deactivated: ${reason}`,
              changedById: ctx.userId,
            },
          });
        }
      }
    }

    const buildChanged = company.industryBuild !== build;
    if (buildChanged) await tx.company.update({ where: { id: companyId }, data: { industryBuild: build } });
    if (buildChanged || created || updated || removed) {
      await tx.auditEvent.create({
        data: {
          companyId,
          actorId: ctx.userId,
          source: "PLATFORM",
          module: "PLATFORM",
          entityType: "Company",
          entityId: companyId,
          action: "PLATFORM_INDUSTRY_BUILD_UPDATED",
          correlationId: ctx.correlationId,
          beforeData: { build: company.industryBuild } as Prisma.InputJsonValue,
          afterData: { build, modulesAdded: created, modulesChanged: updated, modulesRemoved: removed } as Prisma.InputJsonValue,
          reason,
        },
      });
    }
    return { buildChanged, created, updated, removed };
  });

  return { ...summary, state: await getCompanyIndustryBuild(ctx, companyId) };
}

// Used by createPlatformCompany: the core modules plus the build's default
// optional ones, as BUNDLE entitlements, with the usual history rows.
export async function grantInitialModules(tx: Prisma.TransactionClient, ctx: RequestContext, companyId: string, build: IndustryBuildId) {
  const effectiveFrom = new Date();
  const modules: ModuleKey[] = initialModuleKeys(build);
  await tx.companyModuleEntitlement.createMany({
    data: modules.map((module) => ({
      companyId,
      product: PRODUCT,
      module,
      status: "ACTIVE" as EntitlementStatus,
      source: "BUNDLE" as EntitlementSource,
      effectiveFrom,
      expiresAt: null,
      gracePeriodDays: null,
    })),
  });
  await tx.entitlementHistory.createMany({
    data: modules.map((module) => ({
      companyId,
      product: PRODUCT,
      module,
      previousStatus: null,
      newStatus: "ACTIVE" as EntitlementStatus,
      source: "BUNDLE" as EntitlementSource,
      effectiveAt: effectiveFrom,
      expiresAt: null,
      reason: `Default modules for the ${BUILDS[build].label} build granted on company creation`,
      changedById: ctx.userId,
    })),
  });
}
