import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { JOBS_WIP_TABLE_KEY, JOBS_WIP_DEFAULT_COLUMNS, normalizeJobsWipColumns, type JobsWipColumnId } from "./wip-columns";

// ---------------------------------------------------------------------------
// Jobs & WIP list — persistence for the customizable-columns feature (see
// wip-columns.ts's own header comment for the full picture). Server-only —
// this is the one of the two files that's allowed to import prisma/auth
// guards; keep it that way, or the client-side column picker's bundle picks
// up the database client the moment it imports anything from here. Same
// small owned-JSON-preference-row shape and upsert/audit pattern as
// getDashboardConfig/saveDashboardConfig/resetDashboardConfig
// (src/lib/dashboard/service.ts), just against UserTableColumns instead of
// UserDashboardConfig.
// ---------------------------------------------------------------------------

function authorize(ctx: RequestContext) {
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  return ctx.companyId!;
}

// Falls back to the default set (rather than erroring) when a user hasn't
// picked anything yet — same "no row yet just means defaults" convention as
// getDashboardConfig.
export async function getJobsWipColumns(ctx: RequestContext): Promise<JobsWipColumnId[]> {
  const companyId = authorize(ctx);
  const row = await prisma.userTableColumns.findUnique({
    where: { userId_companyId_tableKey: { userId: ctx.userId, companyId, tableKey: JOBS_WIP_TABLE_KEY } },
  });
  if (!row) return JOBS_WIP_DEFAULT_COLUMNS;
  return normalizeJobsWipColumns(row.columns);
}

export async function saveJobsWipColumns(ctx: RequestContext, raw: unknown): Promise<JobsWipColumnId[]> {
  const companyId = authorize(ctx);
  requireModule(ctx, "JOBS_WIP", "WRITE");
  const columns = normalizeJobsWipColumns(raw);
  await prisma.$transaction(async (tx) => {
    const saved = await tx.userTableColumns.upsert({
      where: { userId_companyId_tableKey: { userId: ctx.userId, companyId, tableKey: JOBS_WIP_TABLE_KEY } },
      create: { userId: ctx.userId, companyId, tableKey: JOBS_WIP_TABLE_KEY, columns: columns as Prisma.InputJsonValue },
      update: { columns: columns as Prisma.InputJsonValue },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        actorId: ctx.userId,
        supportAccessId: ctx.supportAccessId,
        source: "API",
        module: "JOBS_WIP",
        entityType: "UserTableColumns",
        entityId: saved.id,
        action: "JOBS_WIP_COLUMNS_SAVED",
        correlationId: ctx.correlationId,
        afterData: columns as Prisma.InputJsonValue,
      },
    });
  });
  return columns;
}

// No extra WRITE check here, matching resetDashboardConfig's own asymmetry
// with saveDashboardConfig — clearing a personal display preference back to
// default isn't a module-data write, so the same VIEW-tier authorize() used
// for reading is enough.
export async function resetJobsWipColumns(ctx: RequestContext): Promise<JobsWipColumnId[]> {
  const companyId = authorize(ctx);
  await prisma.userTableColumns.deleteMany({ where: { userId: ctx.userId, companyId, tableKey: JOBS_WIP_TABLE_KEY } });
  return JOBS_WIP_DEFAULT_COLUMNS;
}
