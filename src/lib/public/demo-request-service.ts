import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendPlatformEmail } from "@/lib/email";

// 2026-10-19 — landing page (floxintegrations.co.za). The "Request a demo" form on the public marketing site posts to
// /api/v1/public/demo-request. This service saves the request (shown to platform staff under Platform > Demo Requests)
// and emails it to the Flo X admin mailbox through the platform email settings (the same SMTP the forgot-password email
// uses). Either one succeeding counts as received, so a mail problem never loses a request.
//
// This is the one endpoint in the app that anyone on the internet can call, so it is deliberately narrow:
//   - fixed fields with length limits, plain-text email only (visitor text is never put into HTML),
//   - a hidden "botcheck" field that real visitors leave empty,
//   - three rate limits (per IP, per visitor email, and one overall cap) so the mailbox can't be flooded,
//   - CORS limited to the landing page's own addresses.
// The per-IP limit uses X-Forwarded-For, which a client can fake, so the per-email and overall caps are what really
// protect the inbox.

export const DEFAULT_DEMO_RECIPIENT = "floxadmin@floxintegrations.co.za";
export const DEFAULT_ALLOWED_ORIGINS = ["https://floxintegrations.co.za", "https://www.floxintegrations.co.za"];

export const BUSINESS_TYPES = ["Workshop (repair, rebuild, field service)", "Engineering / machining", "Other"] as const;

const clean = (max: number) => z.string().trim().max(max).transform((value) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""));

export const demoRequestSchema = z.object({
  name: clean(100).pipe(z.string().min(1)),
  email: z.string().trim().max(200).email().transform((value) => value.toLowerCase()),
  company: clean(150).optional().default(""),
  phone: clean(40).optional().default(""),
  business_type: z.enum(BUSINESS_TYPES).optional().default("Other"),
  message: clean(2000).optional().default(""),
  botcheck: z.string().max(200).optional().default(""),
});

export type DemoRequest = z.infer<typeof demoRequestSchema>;

export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = env.DEMO_REQUEST_ALLOWED_ORIGINS?.split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
  return configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

export function isAllowedOrigin(origin: string | null, env: NodeJS.ProcessEnv = process.env) {
  if (!origin) return false;
  return allowedOrigins(env).includes(origin.replace(/\/$/, ""));
}

// One line, no control characters - a visitor's text must never be able to add an email header.
export function singleLine(value: string, max = 120) {
  return value.replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function buildDemoEmail(input: DemoRequest) {
  const who = singleLine(input.company || input.name, 80);
  const subject = `Flo X demo request – ${who}`;
  const text = [
    "New demo request from the Flo X website",
    "",
    `Name: ${input.name}`,
    `Company: ${input.company || "-"}`,
    `Email: ${input.email}`,
    `Phone: ${input.phone || "-"}`,
    `Business type: ${input.business_type}`,
    "",
    "Message:",
    input.message || "(none)",
    "",
    "Reply to this email to answer the visitor directly.",
  ].join("\n");
  return { subject, text };
}

const WINDOW_MS = 60 * 60_000;
const LIMITS = { ip: 5, email: 3, overall: 30 } as const;
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

// Counts one use of a key in the current hour (the same small table the sign-in limiter uses; no migration needed).
// Returns true when the key is already over its limit.
async function overLimit(rawKey: string, max: number, now: Date) {
  const key = hash(`demo-request|${rawKey}`);
  const existing = await prisma.loginThrottle.findUnique({ where: { keyHash: key } });
  const expired = !existing || existing.windowStart.getTime() + WINDOW_MS <= now.getTime();
  const attemptCount = expired ? 1 : existing.attemptCount + 1;
  await prisma.loginThrottle.upsert({
    where: { keyHash: key },
    create: { keyHash: key, attemptCount, windowStart: now },
    update: { attemptCount, windowStart: expired ? now : existing!.windowStart },
  });
  return attemptCount > max;
}

export async function isDemoRequestThrottled(ip: string, email: string, now = new Date()) {
  const results = await Promise.all([overLimit(`ip|${ip}`, LIMITS.ip, now), overLimit(`email|${email}`, LIMITS.email, now), overLimit("overall", LIMITS.overall, now)]);
  return results.some(Boolean);
}

export async function saveDemoRequest(input: DemoRequest) {
  return prisma.demoRequest.create({
    data: { name: input.name, email: input.email, company: input.company || null, phone: input.phone || null, businessType: input.business_type, message: input.message || null },
    select: { id: true },
  });
}

// Saves, then emails. Resolves to what worked; the caller treats "neither" as a failure.
export async function receiveDemoRequest(input: DemoRequest, env: NodeJS.ProcessEnv = process.env) {
  const saved = await saveDemoRequest(input).then(() => true, (error: unknown) => { console.error("demo-request save failed:", error instanceof Error ? error.message : "unknown"); return false; });
  const emailed = await sendDemoRequestEmail(input, env).then(() => true, (error: unknown) => { console.error("demo-request email failed:", error instanceof Error ? error.message : "unknown"); return false; });
  return { saved, emailed };
}

export async function sendDemoRequestEmail(input: DemoRequest, env: NodeJS.ProcessEnv = process.env) {
  const { subject, text } = buildDemoEmail(input);
  await sendPlatformEmail({ to: env.DEMO_REQUEST_TO?.trim() || DEFAULT_DEMO_RECIPIENT, subject, text, replyTo: input.email });
}
