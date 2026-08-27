import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

function keyHash(email: string, ip: string) {
  return createHash("sha256").update(`${email}|${ip}`, "utf8").digest("hex");
}

type ThrottleDatabase = Pick<typeof prisma, "loginThrottle">;

export async function isLoginBlocked(email: string, ip: string, now = new Date(), database: ThrottleDatabase = prisma) {
  const row = await database.loginThrottle.findUnique({ where: { keyHash: keyHash(email, ip) } });
  return Boolean(row?.lockedUntil && row.lockedUntil > now);
}

export async function recordLoginFailure(email: string, ip: string, now = new Date(), database: ThrottleDatabase = prisma) {
  const key = keyHash(email, ip);
  const existing = await database.loginThrottle.findUnique({ where: { keyHash: key } });
  const expiredWindow = !existing || existing.windowStart.getTime() + WINDOW_MS <= now.getTime();
  const attemptCount = expiredWindow ? 1 : existing.attemptCount + 1;
  await database.loginThrottle.upsert({
    where: { keyHash: key },
    create: { keyHash: key, attemptCount, windowStart: now, lockedUntil: attemptCount >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MS) : null },
    update: { attemptCount, windowStart: expiredWindow ? now : existing!.windowStart, lockedUntil: attemptCount >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MS) : existing?.lockedUntil },
  });
}

export async function clearLoginFailures(email: string, ip: string, database: ThrottleDatabase = prisma) {
  await database.loginThrottle.deleteMany({ where: { keyHash: keyHash(email, ip) } });
}
