import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/security/passwords";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { clearLoginFailures, isLoginBlocked, recordLoginFailure } from "@/lib/security/login-throttle";
import { requestIp, requireSameOrigin } from "@/lib/security/request";
import { defaultTenantDestination } from "@/lib/auth/page-guard";
import { DEFAULT_TENANT_PERMISSIONS } from "@/lib/auth/permissions";

const schema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(512),
  companyCode: z.string().trim().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const input = schema.parse(await request.json());
    const ip = requestIp(request);
    if (await isLoginBlocked(input.email, ip)) return NextResponse.json({ error: { code: "LOGIN_THROTTLED", message: "Too many sign-in attempts. Try again later." } }, { status: 429 });
    const user = await prisma.userIdentity.findUnique({
      where: { email: input.email },
      include: {
        memberships: { where: { status: "ACTIVE" }, include: { company: true }, orderBy: { createdAt: "asc" } },
        platformAssignments: { where: { active: true }, select: { id: true } },
      },
    });
    const invalid = () => NextResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } }, { status: 401 });
    if (!user?.active || !(await verifyPassword(user.passwordHash, input.password))) {
      await recordLoginFailure(input.email, ip);
      return invalid();
    }

    const eligibleMemberships = user.memberships.filter((membership) => membership.company.status === "ACTIVE");
    const preferPlatformContext = !input.companyCode && user.platformAssignments.length > 0;
    const membership = preferPlatformContext
      ? null
      : input.companyCode
        ? eligibleMemberships.find((item) => item.company.internalCode === input.companyCode)
        : eligibleMemberships.length === 1 ? eligibleMemberships[0] : null;

    if (input.companyCode && !membership) return invalid();
    if (!membership && eligibleMemberships.length > 1) {
      return NextResponse.json({
        error: { code: "COMPANY_REQUIRED", message: "Choose a company to continue." },
        companies: eligibleMemberships.map((item) => ({ code: item.company.internalCode, name: item.company.tradingName ?? item.company.legalName })),
      }, { status: 409 });
    }
    if (!membership && user.platformAssignments.length === 0) return invalid();

    await clearLoginFailures(input.email, ip);
    const session = await createSession(user.id, membership?.id ?? null);
    await setSessionCookie(session.token, session.expiresAt);
    // 2026-10-01 — was hardcoded "/dashboard" for every membership; a role
    // like Mechanic no longer has DASHBOARD_VIEW (see permissions.ts), so
    // that would have landed them on a page they're immediately bounced
    // off of by the new page guard. This uses the role's *default*
    // permission set (not the fully-resolved, override-aware set
    // getRequestContext() would compute) as a lightweight heuristic for
    // picking a landing page — a cheap, good-enough choice since the real
    // enforcement is requireTenantPageAccess on the destination page
    // itself, not this redirect.
    const destination = membership ? defaultTenantDestination(DEFAULT_TENANT_PERMISSIONS[membership.role]) : "/platform";
    return NextResponse.json({ ok: true, destination });
  } catch (error) {
    return apiError(error);
  }
}
