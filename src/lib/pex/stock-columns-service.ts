import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { PEX_STOCK_TABLE_KEY, PEX_STOCK_DEFAULT_COLUMNS, normalizePexStockColumns, type PexStockColumnId } from "./stock-columns";

// PEX Stock - per-user column choice (see stock-columns.ts). Server-only; same
// owned-JSON-preference-row pattern as lib/jobs/wip-columns-service.ts. Choosing
// which columns to look at is a personal display setting, so anyone who may
// view PEX Stock may save theirs (no write permission needed).

function authorize(ctx: RequestContext) {
  requireModule(ctx, "PEX_STOCK", "READ");
  requireTenantPermission(ctx, "PEX_STOCK_VIEW");
  return ctx.companyId!;
}

export async function getPexStockColumns(ctx: RequestContext): Promise<PexStockColumnId[]> {
  const companyId = authorize(ctx);
  const row = await prisma.userTableColumns.findUnique({
    where: { userId_companyId_tableKey: { userId: ctx.userId, companyId, tableKey: PEX_STOCK_TABLE_KEY } },
  });
  return row ? normalizePexStockColumns(row.columns) : PEX_STOCK_DEFAULT_COLUMNS;
}

export async function savePexStockColumns(ctx: RequestContext, raw: unknown): Promise<PexStockColumnId[]> {
  const companyId = authorize(ctx);
  const columns = normalizePexStockColumns(raw);
  await prisma.userTableColumns.upsert({
    where: { userId_companyId_tableKey: { userId: ctx.userId, companyId, tableKey: PEX_STOCK_TABLE_KEY } },
    create: { userId: ctx.userId, companyId, tableKey: PEX_STOCK_TABLE_KEY, columns: columns as Prisma.InputJsonValue },
    update: { columns: columns as Prisma.InputJsonValue },
  });
  return columns;
}

export async function resetPexStockColumns(ctx: RequestContext): Promise<PexStockColumnId[]> {
  const companyId = authorize(ctx);
  await prisma.userTableColumns.deleteMany({ where: { userId: ctx.userId, companyId, tableKey: PEX_STOCK_TABLE_KEY } });
  return PEX_STOCK_DEFAULT_COLUMNS;
}
