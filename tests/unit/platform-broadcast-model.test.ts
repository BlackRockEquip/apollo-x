import { describe, expect, it } from "vitest";
import { broadcastInputSchema, broadcastState } from "@/lib/platform/broadcast-model";

// 2026-10-27: Platform > Broadcasts - the rules a broadcast has to pass and the state it is shown in.
const base = { title: "Planned maintenance", message: "Back at 23:00.", kind: "MAINTENANCE", audience: "ALL" };

describe("broadcastInputSchema", () => {
  it("accepts a message to every company", () => {
    const parsed = broadcastInputSchema.parse(base);
    expect(parsed.companyIds).toEqual([]);
    expect(parsed.sendEmail).toBe(false);
    expect(parsed.requireAck).toBe(false);
  });

  it("needs a title and a message", () => {
    expect(broadcastInputSchema.safeParse({ ...base, title: "  " }).success).toBe(false);
    expect(broadcastInputSchema.safeParse({ ...base, message: "" }).success).toBe(false);
  });

  it("needs at least one company when aimed at specific companies", () => {
    expect(broadcastInputSchema.safeParse({ ...base, audience: "COMPANIES", companyIds: [] }).success).toBe(false);
    expect(broadcastInputSchema.safeParse({ ...base, audience: "COMPANIES", companyIds: ["c1"] }).success).toBe(true);
  });

  it("needs at least one user when aimed at specific users", () => {
    expect(broadcastInputSchema.safeParse({ ...base, audience: "USERS", userIds: [] }).success).toBe(false);
    expect(broadcastInputSchema.safeParse({ ...base, audience: "USERS", userIds: ["u1", "u2"] }).success).toBe(true);
  });

  it("only allows web links", () => {
    expect(broadcastInputSchema.safeParse({ ...base, linkUrl: "https://floxintegrations.co.za/news" }).success).toBe(true);
    expect(broadcastInputSchema.safeParse({ ...base, linkUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("must stop showing after it starts", () => {
    const ok = broadcastInputSchema.safeParse({ ...base, startsAt: "2026-11-02T06:00:00.000Z", expiresAt: "2026-11-03T06:00:00.000Z" });
    const bad = broadcastInputSchema.safeParse({ ...base, startsAt: "2026-11-02T06:00:00.000Z", expiresAt: "2026-11-01T06:00:00.000Z" });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it("rejects an unknown message type", () => {
    expect(broadcastInputSchema.safeParse({ ...base, kind: "SPAM" }).success).toBe(false);
  });
});

describe("broadcastState", () => {
  const now = new Date("2026-10-27T10:00:00Z");
  const past = new Date("2026-10-27T08:00:00Z");
  const future = new Date("2026-10-28T08:00:00Z");

  it("is scheduled until it has been delivered", () => {
    expect(broadcastState({ deliveredAt: null, withdrawnAt: null, expiresAt: null }, now)).toBe("scheduled");
  });
  it("is showing once delivered and not expired", () => {
    expect(broadcastState({ deliveredAt: past, withdrawnAt: null, expiresAt: null }, now)).toBe("showing");
    expect(broadcastState({ deliveredAt: past, withdrawnAt: null, expiresAt: future }, now)).toBe("showing");
  });
  it("is expired once its end time has passed", () => {
    expect(broadcastState({ deliveredAt: past, withdrawnAt: null, expiresAt: past }, now)).toBe("expired");
  });
  it("withdrawn wins over everything else", () => {
    expect(broadcastState({ deliveredAt: past, withdrawnAt: past, expiresAt: future }, now)).toBe("withdrawn");
    expect(broadcastState({ deliveredAt: null, withdrawnAt: past, expiresAt: null }, now)).toBe("withdrawn");
  });
});
