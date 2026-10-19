import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;

// 2026-10-19, security review. The sign-in limiter used to count failures only per (email + IP). The IP comes from the
// X-Forwarded-For header, whose first entry a client can set to anything, so rotating a made-up IP gave unlimited guesses
// at one account; and one IP trying one password against many accounts never hit any limit. Three counters now run side
// by side, and a sign-in is blocked when ANY of them is locked:
//   pair  - this email from this IP            (5 failures)  the original rule
//   email - this email from anywhere            (10 failures) cannot be dodged by changing the claimed IP
//   ip    - this IP against any account         (30 failures) stops one source spraying many accounts
// The email counter can lock a real user out for a while if someone hammers their address; they can still use Forgot
// password, which is limited separately, and the lock clears itself after the lock time.
const LIMITS = { pair: 5, email: 10, ip: 30 } as const;

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function keyHash(email: string, ip: string) {
  return hash(`${email}|${ip}`);
}

const emailKey = (email: string) => hash(`email|${email}`);
const ipKey = (ip: string) => hash(`ip|${ip}`);

type ThrottleDatabase = Pick<typeof prisma, "loginThrottle">;

export async function isLoginBlocked(email: string, ip: string, now = new Date(), database: ThrottleDatabase = prisma) {
  for (const key of [keyHash(email, ip), emailKey(email), ipKey(ip)]) {
    const row = await database.loginThrottle.findUnique({ where: { keyHash: key } });
    if (row?.lockedUntil && row.lockedUntil > now) return true;
  }
  return false;
}

async function bump(key: string, max: number, now: Date, database: ThrottleDatabase) {
  const existing = await database.loginThrottle.findUnique({ where: { keyHash: key } });
  const expiredWindow = !existing || existing.windowStart.getTime() + WINDOW_MS <= now.getTime();
  const attemptCount = expiredWindow ? 1 : existing.attemptCount + 1;
  const lock = attemptCount >= max ? new Date(now.getTime() + LOCK_MS) : null;
  await database.loginThrottle.upsert({
    where: { keyHash: key },
    create: { keyHash: key, attemptCount, windowStart: now, lockedUntil: lock },
    update: { attemptCount, windowStart: expiredWindow ? now : existing!.windowStart, lockedUntil: lock ?? (expiredWindow ? null : existing?.lockedUntil) },
  });
}

export async function recordLoginFailure(email: string, ip: string, now = new Date(), database: ThrottleDatabase = prisma) {
  await bump(keyHash(email, ip), LIMITS.pair, now, database);
  await bump(emailKey(email), LIMITS.email, now, database);
  await bump(ipKey(ip), LIMITS.ip, now, database);
}

// A successful sign-in clears the pair and email counters; the IP counter is left to expire on its own.
export async function clearLoginFailures(email: string, ip: string, database: ThrottleDatabase = prisma) {
  await database.loginThrottle.deleteMany({ where: { keyHash: { in: [keyHash(email, ip), emailKey(email)] } } });
}
