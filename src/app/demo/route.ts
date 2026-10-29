import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE } from "@/lib/constants";
import { createSession, resolveSessionToken, setSessionCookie } from "@/lib/auth/session";
import { defaultTenantDestination } from "@/lib/auth/page-guard";
import { hashToken } from "@/lib/security/tokens";
import { requestIp } from "@/lib/security/request";
import { DEMO_COMPANY_CODE, demoViewFor, isDemoMode, safeDemoNext } from "@/lib/demo/mode";

export const dynamic = "force-dynamic";

// 2026-10-29: public view-only demo entry (src/lib/demo/mode.ts, docs/demo-site.md).
// GET /demo                 -> signed in as the demo Company admin, lands on their normal first page
// GET /demo?as=mechanic     -> look at the system as another demo role (admin, manager, sales, stores, finance, mechanic)
// GET /demo?next=/jobs      -> lands on that page after signing in (used when a signed-out visitor opens a deep link)
// Only works when DEMO_MODE=true; on the live app this route is a plain 404.

const ENTRY_WINDOW_MS = 15 * 60_000;
const ENTRIES_PER_IP = 40;

function page(status: number, title: string, body: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f8;color:#14202b}main{max-width:440px;margin:24px;padding:28px 32px;background:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(20,32,43,.08)}h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#4a5866;line-height:1.5}</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
}

/** Counts demo entries per visitor IP (reuses the sign-in limiter's table) so a script cannot flood the session table. */
async function tooManyEntries(ip: string, now: Date) {
  const keyHash = createHash("sha256").update(`demo-entry|${ip}`, "utf8").digest("hex");
  const row = await prisma.loginThrottle.findUnique({ where: { keyHash } });
  const fresh = !row || row.windowStart.getTime() + ENTRY_WINDOW_MS <= now.getTime();
  const attemptCount = fresh ? 1 : row.attemptCount + 1;
  await prisma.loginThrottle.upsert({
    where: { keyHash },
    create: { keyHash, attemptCount, windowStart: now },
    update: { attemptCount, windowStart: fresh ? now : row!.windowStart },
  });
  return attemptCount > ENTRIES_PER_IP;
}

export async function GET(request: NextRequest) {
  if (!isDemoMode()) return new NextResponse("Not found", { status: 404 });

  // Safety check: the demo must run on its own database. If any real company is present, refuse to open it up.
  const otherCompanies = await prisma.company.count({ where: { internalCode: { not: DEMO_COMPANY_CODE } } });
  if (otherCompanies > 0) {
    console.error("[demo] DEMO_MODE is on but this database holds companies other than the demo company. Demo entry refused.");
    return page(503, "Demo unavailable", "The live demo is being set up. Please try again a little later.");
  }

  const view = demoViewFor(request.nextUrl.searchParams.get("as"));
  const next = safeDemoNext(request.nextUrl.searchParams.get("next"));
  const user = await prisma.userIdentity.findUnique({
    where: { email: view.email },
    select: { id: true, active: true, memberships: { where: { status: "ACTIVE", company: { internalCode: DEMO_COMPANY_CODE, status: "ACTIVE" } }, select: { id: true } } },
  });
  const membership = user?.active ? user.memberships[0] : undefined;
  if (!user || !membership) {
    console.error(`[demo] Demo login ${view.email} not found. Run "npm run seed:demo:reset" with DEMO_SEEDING=1 against the demo database.`);
    return page(503, "Demo unavailable", "The live demo is being set up. Please try again a little later.");
  }

  const cookieStore = await cookies();
  const now = new Date();
  const existingToken = cookieStore.get(SESSION_COOKIE)?.value;
  const existing = existingToken ? await resolveSessionToken(existingToken) : null;

  let context = existing && existing.userId === user.id ? existing : null;
  if (!context) {
    if (await tooManyEntries(requestIp(request), now)) return page(429, "Too many visits", "Please wait a few minutes before opening the demo again.");
    // Switching role: end the previous demo session instead of leaving it lying around.
    if (existingToken) await prisma.userSession.updateMany({ where: { tokenHash: hashToken(existingToken), revokedAt: null }, data: { revokedAt: now } });
    // Housekeeping: drop this demo login's expired sessions so the table does not grow forever.
    await prisma.userSession.deleteMany({ where: { userId: user.id, expiresAt: { lt: now } } });
    const session = await createSession(user.id, membership.id);
    await setSessionCookie(session.token, session.expiresAt);
    context = await resolveSessionToken(session.token);
  }

  const destination = next ?? (context ? defaultTenantDestination(context.tenantPermissions, context.moduleAccess) : "/dashboard");
  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.headers.set("cache-control", "no-store");
  return response;
}
