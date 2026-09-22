import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security/passwords";
import { createOpaqueToken, hashToken } from "@/lib/security/tokens";
import { isLoginBlocked, recordLoginFailure } from "@/lib/security/login-throttle";
import { sendPlatformEmail } from "@/lib/email";

const RESET_TOKEN_TTL_MS = 60 * 60_000;

// 2026-09-22 — user request: "Allow users to reset there own password, Add
// n forgot password to the login screen." Reuses LoginThrottle (security/
// login-throttle.ts) rather than a new table — prefixing the throttle key
// ("reset:<email>") keeps it in its own bucket, separate from real sign-in
// attempts against the same address, with zero schema changes needed.
// Every call — found account or not — always gets the exact same response
// from the route above this, so this function never reveals whether an
// email has an account; it just no-ops past the point where that would
// leak (throttle lock, unknown/inactive user, unconfigured platform SMTP)
// rather than ever throwing back to the caller.
export async function requestPasswordReset(email: string, ip: string, origin: string) {
  const throttleKey = `reset:${email}`;
  if (await isLoginBlocked(throttleKey, ip)) return;
  // Counts toward the rate limit regardless of outcome — otherwise an
  // attacker could distinguish "real account" from "no account" by
  // whether repeated requests ever get throttled.
  await recordLoginFailure(throttleKey, ip);

  const user = await prisma.userIdentity.findUnique({ where: { email } });
  if (!user?.active) return;

  const token = createOpaqueToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  // Delivery failure (most likely: platform SMTP was never configured —
  // see PlatformSettings) must never surface to the caller, for the same
  // "don't leak account existence or system state" reason as the throttle
  // check above; it's simply a reset link nobody receives.
  await sendPlatformEmail({
    to: user.email,
    subject: "Reset your Apollo X password",
    text: `We received a request to reset your Apollo X password. This link is valid for 1 hour:\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email — your password won't change.`,
    html: `<p>We received a request to reset your Apollo X password. This link is valid for 1 hour:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
  }).catch(() => {});
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  const now = new Date();
  if (!record || record.usedAt || record.expiresAt <= now) throw new Error("INVALID_RESET_TOKEN");
  const user = await prisma.userIdentity.findUnique({ where: { id: record.userId } });
  if (!user?.active) throw new Error("INVALID_RESET_TOKEN");

  await prisma.$transaction([
    prisma.userIdentity.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 } } }),
    prisma.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: now } }),
    // A reset link is single-use, but also close out any other
    // still-outstanding reset requests for this user so an older, unused
    // link can't be redeemed after a newer one already succeeded.
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null, id: { not: record.id } }, data: { usedAt: now } }),
  ]);
  return { ok: true };
}
