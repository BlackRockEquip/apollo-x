import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";

// 2026-10-19 — Platform > Demo Requests. Enquiries from the landing page's "Request a demo" form (saved by
// lib/public/demo-request-service.ts). Platform staff read them (PLATFORM_SUPPORT_READ) and move them between New and
// History (PLATFORM_SUPPORT_WRITE). They belong to no company, so this is platform context only.

export type DemoRequestView = "NEW" | "HISTORY";
export type DemoRequestRow = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  businessType: string | null;
  message: string | null;
  status: DemoRequestView;
  createdAt: string;
  movedToHistoryAt: string | null;
  movedToHistoryBy: string | null;
  /** Proposals made from this request (newest first). */
  proposals: { id: string; number: string; status: string }[];
};

const PROPOSALS_INCLUDE = { proposals: { select: { id: true, number: true, status: true }, orderBy: { createdAt: "desc" as const } } };

const statusSchema = z.object({ status: z.enum(["NEW", "HISTORY"]) });

function requirePlatformContext(ctx: RequestContext) {
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
}

function toRow(r: { id: string; name: string; email: string; company: string | null; phone: string | null; businessType: string | null; message: string | null; status: "NEW" | "HISTORY"; createdAt: Date; movedToHistoryAt: Date | null; movedToHistoryBy: string | null; proposals: { id: string; number: string; status: string }[] }): DemoRequestRow {
  return { ...r, createdAt: r.createdAt.toISOString(), movedToHistoryAt: r.movedToHistoryAt ? r.movedToHistoryAt.toISOString() : null };
}

export async function listDemoRequests(ctx: RequestContext, view: DemoRequestView): Promise<DemoRequestRow[]> {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_READ");
  requirePlatformContext(ctx);
  const rows = await prisma.demoRequest.findMany({ where: { status: view }, orderBy: view === "NEW" ? { createdAt: "desc" } : { movedToHistoryAt: "desc" }, take: 500, include: PROPOSALS_INCLUDE });
  return rows.map(toRow);
}

export async function countDemoRequests(ctx: RequestContext): Promise<{ newCount: number; historyCount: number }> {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_READ");
  requirePlatformContext(ctx);
  const [newCount, historyCount] = await Promise.all([prisma.demoRequest.count({ where: { status: "NEW" } }), prisma.demoRequest.count({ where: { status: "HISTORY" } })]);
  return { newCount, historyCount };
}

// For the sidebar badge: never lets a problem here (for example the table not being migrated yet) break the whole platform layout.
export async function newDemoRequestCountSafe(ctx: RequestContext): Promise<number> {
  try {
    if (!ctx.platformPermissions.has("PLATFORM_SUPPORT_READ")) return 0;
    return await prisma.demoRequest.count({ where: { status: "NEW" } });
  } catch {
    return 0;
  }
}

export async function setDemoRequestStatus(ctx: RequestContext, id: string, input: unknown): Promise<DemoRequestRow> {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_WRITE");
  requirePlatformContext(ctx);
  const { status } = statusSchema.parse(input);
  const existing = await prisma.demoRequest.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new Error("NOT_FOUND");
  const updated = await prisma.demoRequest.update({
    where: { id },
    data: status === "HISTORY" ? { status, movedToHistoryAt: new Date(), movedToHistoryBy: ctx.displayName } : { status, movedToHistoryAt: null, movedToHistoryBy: null },
    include: PROPOSALS_INCLUDE,
  });
  return toRow(updated);
}
