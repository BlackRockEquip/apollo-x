import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRequestContext();
    const id = (await params).id;
    const row = await prisma.supportTicketAttachment.findUnique({ where: { id }, include: { ticket: true } });
    if (!row) return new NextResponse(null, { status: 404 });
    if (ctx.companyId) {
      if (row.ticket.companyId !== ctx.companyId) return new NextResponse(null, { status: 404 });
      const canViewAll = ctx.tenantPermissions.has("USERS_MANAGE");
      if (!canViewAll) {
        const own = await prisma.supportTicket.findFirst({ where: { id: row.ticketId, companyId: ctx.companyId, reportedById: ctx.userId }, select: { id: true } });
        if (!own) return new NextResponse(null, { status: 404 });
      }
    } else if (!ctx.platformPermissions.has("PLATFORM_SUPPORT_READ")) {
      return new NextResponse(null, { status: 403 });
    }
    const safeName = row.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
    return new NextResponse(Buffer.from(row.data), { headers: { "content-type": row.mimeType, "content-disposition": `inline; filename="${safeName}"`, "cache-control": "private, max-age=60" } });
  } catch (error) {
    return apiError(error);
  }
}