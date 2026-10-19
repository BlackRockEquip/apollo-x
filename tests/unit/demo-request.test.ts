import { beforeEach, describe, expect, it, vi } from "vitest";

const sendPlatformEmail = vi.fn();
const rows = new Map<string, { attemptCount: number; windowStart: Date }>();
const demoCreate = vi.fn();
vi.mock("@/lib/email", () => ({ sendPlatformEmail: (...args: unknown[]) => sendPlatformEmail(...args) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    demoRequest: { create: (...args: unknown[]) => demoCreate(...args) },
    loginThrottle: {
      findUnique: async ({ where }: { where: { keyHash: string } }) => rows.get(where.keyHash) ?? null,
      upsert: async ({ where, create, update }: { where: { keyHash: string }; create: { attemptCount: number; windowStart: Date }; update: { attemptCount: number; windowStart: Date } }) => {
        rows.set(where.keyHash, rows.has(where.keyHash) ? { ...rows.get(where.keyHash)!, ...update } : create);
      },
    },
  },
}));

import { allowedOrigins, buildDemoEmail, demoRequestSchema, isAllowedOrigin, isDemoRequestThrottled, receiveDemoRequest, sendDemoRequestEmail, singleLine } from "@/lib/public/demo-request-service";

beforeEach(() => { rows.clear(); sendPlatformEmail.mockReset(); demoCreate.mockReset(); });

describe("demo request: input checks", () => {
  it("accepts a normal request and lowercases the email", () => {
    const r = demoRequestSchema.parse({ name: " Anna ", email: "Anna@Example.com", company: "Karoo Plant", business_type: "Engineering / machining" });
    expect(r.name).toBe("Anna");
    expect(r.email).toBe("anna@example.com");
    expect(r.message).toBe("");
  });
  it("needs a name and a valid email", () => {
    expect(() => demoRequestSchema.parse({ name: "", email: "a@b.co" })).toThrow();
    expect(() => demoRequestSchema.parse({ name: "A", email: "not-an-email" })).toThrow();
  });
  it("rejects over-long fields and unknown business types", () => {
    expect(() => demoRequestSchema.parse({ name: "x".repeat(101), email: "a@b.co" })).toThrow();
    expect(() => demoRequestSchema.parse({ name: "A", email: "a@b.co", message: "x".repeat(2001) })).toThrow();
    expect(() => demoRequestSchema.parse({ name: "A", email: "a@b.co", business_type: "Spaceship" })).toThrow();
  });
});

describe("demo request: email content", () => {
  it("cannot inject extra email headers through the subject", () => {
    const { subject } = buildDemoEmail(demoRequestSchema.parse({ name: "A", email: "a@b.co", company: "Evil\r\nBcc: x@y.z" }));
    expect(subject).not.toMatch(/[\r\n]/);
    expect(singleLine("a\r\nb\u0000c")).toBe("a b c");
  });
  it("is sent to the admin mailbox with the visitor as reply-to", async () => {
    await sendDemoRequestEmail(demoRequestSchema.parse({ name: "Anna", email: "anna@example.com", message: "Hello" }), {} as NodeJS.ProcessEnv);
    expect(sendPlatformEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "floxadmin@floxintegrations.co.za", replyTo: "anna@example.com" }));
    expect(sendPlatformEmail.mock.calls[0][0].text).toContain("Hello");
    expect(sendPlatformEmail.mock.calls[0][0].html).toBeUndefined();
  });
  it("can be redirected with DEMO_REQUEST_TO", async () => {
    await sendDemoRequestEmail(demoRequestSchema.parse({ name: "A", email: "a@b.co" }), { DEMO_REQUEST_TO: "sales@example.com" } as unknown as NodeJS.ProcessEnv);
    expect(sendPlatformEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "sales@example.com" }));
  });
});

describe("demo request: allowed websites", () => {
  it("accepts only the landing page addresses by default", () => {
    expect(isAllowedOrigin("https://floxintegrations.co.za", {} as NodeJS.ProcessEnv)).toBe(true);
    expect(isAllowedOrigin("https://www.floxintegrations.co.za", {} as NodeJS.ProcessEnv)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", {} as NodeJS.ProcessEnv)).toBe(false);
    expect(isAllowedOrigin("https://floxintegrations.co.za.evil.example", {} as NodeJS.ProcessEnv)).toBe(false);
    expect(isAllowedOrigin(null, {} as NodeJS.ProcessEnv)).toBe(false);
  });
  it("can be changed with DEMO_REQUEST_ALLOWED_ORIGINS", () => {
    expect(allowedOrigins({ DEMO_REQUEST_ALLOWED_ORIGINS: "https://a.example/, https://b.example" } as unknown as NodeJS.ProcessEnv)).toEqual(["https://a.example", "https://b.example"]);
  });
});

describe("demo request: rate limits", () => {
  it("blocks a visitor email after 3 requests in an hour", async () => {
    const now = new Date("2026-10-19T10:00:00Z");
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await isDemoRequestThrottled(`10.0.0.${i}`, "same@example.com", now));
    expect(results).toEqual([false, false, false, true, true]);
  });
  it("blocks one IP after 5 requests, and lets it back in after the hour", async () => {
    const now = new Date("2026-10-19T10:00:00Z");
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await isDemoRequestThrottled("1.2.3.4", `v${i}@example.com`, now));
    expect(results).toEqual([false, false, false, false, false, true]);
    expect(await isDemoRequestThrottled("1.2.3.4", "later@example.com", new Date(now.getTime() + 61 * 60_000))).toBe(false);
  });
  it("has an overall cap of 30 an hour even if IPs and emails keep changing", async () => {
    const now = new Date("2026-10-19T10:00:00Z");
    let blockedAt = -1;
    for (let i = 0; i < 40; i++) { if (await isDemoRequestThrottled(`9.9.9.${i}`, `u${i}@example.com`, now)) { blockedAt = i; break; } }
    expect(blockedAt).toBe(30);
  });
});

describe("demo request: saved and emailed", () => {
  const input = () => demoRequestSchema.parse({ name: "Anna", email: "Anna@Example.com", company: "Karoo Plant", message: "Hello" });
  it("saves the request for the Demo Requests screen and sends the email", async () => {
    demoCreate.mockResolvedValue({ id: "d1" });
    sendPlatformEmail.mockResolvedValue(undefined);
    expect(await receiveDemoRequest(input(), {} as NodeJS.ProcessEnv)).toEqual({ saved: true, emailed: true });
    expect(demoCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: "Anna", email: "anna@example.com", company: "Karoo Plant", phone: null, message: "Hello" }) }));
  });
  it("keeps the request even when the email cannot be sent", async () => {
    demoCreate.mockResolvedValue({ id: "d1" });
    sendPlatformEmail.mockRejectedValue(new Error("EMAIL_NOT_CONFIGURED"));
    expect(await receiveDemoRequest(input(), {} as NodeJS.ProcessEnv)).toEqual({ saved: true, emailed: false });
  });
  it("still sends the email when saving fails, and reports both failing", async () => {
    demoCreate.mockRejectedValue(new Error("db down"));
    sendPlatformEmail.mockResolvedValue(undefined);
    expect(await receiveDemoRequest(input(), {} as NodeJS.ProcessEnv)).toEqual({ saved: false, emailed: true });
    sendPlatformEmail.mockRejectedValue(new Error("smtp down"));
    expect(await receiveDemoRequest(input(), {} as NodeJS.ProcessEnv)).toEqual({ saved: false, emailed: false });
  });
});
