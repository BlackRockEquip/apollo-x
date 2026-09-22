import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { prisma } from "@/lib/prisma";
import { clearSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/security/passwords";

// 2026-09-22 — user request: "Allow users to reset there own password."
// Deliberately its own tiny file rather than living in users/service.ts:
// every function there is gated behind USERS_MANAGE (admin-only), but
// changing YOUR OWN password has to be available to any signed-in user —
// tenant or platform admin alike — with no special permission at all,
// just proof of the current password.
const changePasswordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(120),
});

export async function changeOwnPassword(ctx: RequestContext, raw: unknown) {
  const input = changePasswordInput.parse(raw);
  const user = await prisma.userIdentity.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) throw new Error("INVALID_CURRENT_PASSWORD");
  await prisma.userIdentity.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword), sessionVersion: { increment: 1 } },
  });
  // Bumping sessionVersion above already invalidates every session
  // (including this one, on its next resolve) — revoke the rows outright
  // too, same as resetTenantUserSessions/admin-service's revokeUserSessions,
  // and clear this request's own cookie so the browser doesn't keep
  // sending a dead token.
  await prisma.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await clearSession();
  return { ok: true };
}
