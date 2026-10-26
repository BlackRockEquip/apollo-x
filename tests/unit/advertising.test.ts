import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/auth/context-types";

// 2026-10-23, user request: Platform > Advertising + the sidebar ad block.
const h = vi.hoisted(() => ({
  adFindMany: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  adUpdate: vi.fn<(args: unknown) => Promise<unknown>>(),
  adCreate: vi.fn<(args: unknown) => Promise<unknown>>(),
  settingsFind: vi.fn<(args: unknown) => Promise<unknown>>(),
  auditCreate: vi.fn<(args: unknown) => Promise<unknown>>(),
}));
vi.mock("@prisma/client", () => ({ Prisma: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    advertisement: { findMany: h.adFindMany, update: h.adUpdate, create: h.adCreate },
    companySettings: { findUnique: h.settingsFind },
    auditEvent: { create: h.auditCreate },
    company: { findMany: async () => [] },
  },
}));

import { MAX_SLOTS, adInputSchema, isSlotLive, localParts, nextLiveLabel, normalizeAdLink, parseSlots, pickLiveAds, sniffAdImage, type AdSlot } from "@/lib/ads/model";
import { createAd, getSidebarAds, recordAdClick, recordAdView } from "@/lib/ads/service";

// 2026-11-02 is a Monday. South Africa is UTC+2 all year, so 06:00Z = 08:00 local.
const monday8 = new Date("2026-11-02T06:00:00Z");
const slot = (over: Partial<AdSlot> = {}): AdSlot => ({ days: [0, 1, 2, 3, 4], from: "08:00", to: "12:00", startDate: "2026-11-01", endDate: "2026-11-30", ...over });
const valid = { advertiser: "HydroTech", headline: "Rams in stock", linkUrl: "hydrotech.co.za", slots: [slot()] };

describe("timeslots (South African time)", () => {
  it("reads the local date, time and weekday", () => {
    expect(localParts(monday8)).toEqual({ date: "2026-11-02", minutes: 480, weekday: 0 });
    // 23:30Z on Sunday is already 01:30 on Monday in South Africa.
    expect(localParts(new Date("2026-11-01T23:30:00Z"))).toEqual({ date: "2026-11-02", minutes: 90, weekday: 0 });
  });

  it("is live from the start time until just before the end time", () => {
    expect(isSlotLive(slot(), new Date("2026-11-02T05:59:00Z"))).toBe(false); // 07:59
    expect(isSlotLive(slot(), monday8)).toBe(true); // 08:00
    expect(isSlotLive(slot(), new Date("2026-11-02T09:59:00Z"))).toBe(true); // 11:59
    expect(isSlotLive(slot(), new Date("2026-11-02T10:00:00Z"))).toBe(false); // 12:00
  });

  it("only runs on the ticked days and inside the date range", () => {
    expect(isSlotLive(slot({ days: [5] }), monday8)).toBe(false);
    expect(isSlotLive(slot({ days: [5] }), new Date("2026-11-07T06:00:00Z"))).toBe(true); // Saturday
    expect(isSlotLive(slot({ startDate: "2026-11-03" }), monday8)).toBe(false);
    expect(isSlotLive(slot({ endDate: "2026-11-01" }), monday8)).toBe(false);
    expect(isSlotLive(slot({ endDate: "2026-11-02" }), monday8)).toBe(true);
  });

  it("ignores broken slots stored in the database and keeps at most ten", () => {
    expect(parseSlots([{ nonsense: true }, slot()])).toHaveLength(1);
    expect(parseSlots(Array.from({ length: 14 }, () => slot()))).toHaveLength(MAX_SLOTS);
    expect(parseSlots(null)).toEqual([]);
  });

  it("says when a paused-out ad next goes live", () => {
    expect(nextLiveLabel([slot()], new Date("2026-11-02T10:30:00Z"))).toBe("Tue 03/11 08:00");
    expect(nextLiveLabel([], monday8)).toBeNull();
    expect(nextLiveLabel([slot({ endDate: "2026-11-01", startDate: "2026-11-01" })], monday8)).toBeNull();
  });
});

describe("ad validation", () => {
  it("accepts a complete ad and fills the defaults", () => {
    const ad = adInputSchema.parse(valid);
    expect(ad).toMatchObject({ audience: "ALL", active: true, buttonText: "", companyIds: [] });
  });

  it("needs no headline or button text (a picture-only ad)", () => {
    const ad = adInputSchema.parse({ advertiser: "HydroTech", linkUrl: "hydrotech.co.za", slots: [slot()] });
    expect(ad).toMatchObject({ headline: "", body: "", buttonText: "" });
    expect(adInputSchema.safeParse({ advertiser: "", linkUrl: "hydrotech.co.za" }).success).toBe(false);
  });

  it("allows at most ten timeslots", () => {
    expect(adInputSchema.safeParse({ ...valid, slots: Array.from({ length: 10 }, () => slot()) }).success).toBe(true);
    expect(adInputSchema.safeParse({ ...valid, slots: Array.from({ length: 11 }, () => slot()) }).success).toBe(false);
  });

  it("rejects bad times, dates and days", () => {
    expect(adInputSchema.safeParse({ ...valid, slots: [slot({ from: "12:00", to: "08:00" })] }).success).toBe(false);
    expect(adInputSchema.safeParse({ ...valid, slots: [slot({ startDate: "2026-12-01", endDate: "2026-11-01" })] }).success).toBe(false);
    expect(adInputSchema.safeParse({ ...valid, slots: [slot({ days: [] })] }).success).toBe(false);
  });

  it("only accepts web links", () => {
    expect(normalizeAdLink("hydrotech.co.za/offers")).toBe("https://hydrotech.co.za/offers");
    expect(normalizeAdLink("http://x.co.za")).toBe("http://x.co.za/");
    expect(normalizeAdLink("javascript:alert(1)")).toBeNull();
    expect(normalizeAdLink("data:text/html,hi")).toBeNull();
    expect(normalizeAdLink("  ")).toBeNull();
    expect(adInputSchema.safeParse({ ...valid, linkUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("needs companies when the ad is for selected companies", () => {
    expect(adInputSchema.safeParse({ ...valid, audience: "SELECTED", companyIds: [] }).success).toBe(false);
    expect(adInputSchema.safeParse({ ...valid, audience: "SELECTED", companyIds: ["c1"] }).success).toBe(true);
  });

  it("only allows PNG, JPG and WebP pictures (checked by content, never SVG)", () => {
    expect(sniffAdImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/png");
    expect(sniffAdImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffAdImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0]))).toBe("image/webp");
    expect(sniffAdImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>"))).toBeNull();
  });
});

const row = (id: string, over: Record<string, unknown> = {}) => ({ id, advertiser: `Adv ${id}`, headline: `Head ${id}`, body: "x", buttonText: "Go", linkUrl: "https://a.co.za/", imageVersion: 0, imageMime: null, active: true, audience: "ALL", companyIds: [], slots: [slot()], createdAt: new Date("2026-10-01T00:00:00Z"), ...over });

describe("which ads a company sees", () => {
  it("shows only live, active ads aimed at that company, oldest first", () => {
    const ads = [
      row("b", { createdAt: new Date("2026-10-02T00:00:00Z") }),
      row("a"),
      row("paused", { active: false }),
      row("later", { slots: [slot({ from: "13:00", to: "14:00" })] }),
      row("other", { audience: "SELECTED", companyIds: ["c9"] }),
      row("mine", { audience: "SELECTED", companyIds: ["c1"], createdAt: new Date("2026-10-03T00:00:00Z") }),
    ];
    expect(pickLiveAds(ads as never, "c1", monday8).map((ad) => (ad as { id: string }).id)).toEqual(["a", "b", "mine"]);
    expect(pickLiveAds(ads as never, "c2", monday8).map((ad) => (ad as { id: string }).id)).toEqual(["a", "b"]);
  });

  it("shows nothing (Flo X's card) when no ad is live", () => {
    expect(pickLiveAds([row("a")] as never, "c1", new Date("2026-12-25T06:00:00Z"))).toEqual([]);
  });
});

function ctx(over: Partial<RequestContext> = {}): RequestContext {
  return { userId: "u1", companyId: "c1", supportAccessId: null, correlationId: "k", platformPermissions: new Set<string>(), ...over } as unknown as RequestContext;
}

describe("the sidebar block", () => {
  beforeEach(() => {
    h.adFindMany.mockReset().mockResolvedValue([row("a", { imageMime: "image/png", imageVersion: 3 }), row("b")]);
    h.adUpdate.mockReset().mockResolvedValue({});
    h.adCreate.mockReset();
    h.auditCreate.mockReset().mockResolvedValue({});
    h.settingsFind.mockReset().mockResolvedValue({ hideAds: false });
  });

  it("returns the live ads for the company, with the picture address", async () => {
    const result = await getSidebarAds(ctx(), monday8);
    expect(result.hidden).toBe(false);
    expect(result.ads.map((a) => a.id)).toEqual(["a", "b"]);
    expect(result.ads[0].imageUrl).toBe("/api/v1/ads/a/image?v=3");
    expect(result.ads[1].imageUrl).toBeNull();
    expect(JSON.stringify(result)).not.toContain("linkUrl");
  });

  it("returns an empty list (Flo X card) when nothing is live", async () => {
    h.adFindMany.mockResolvedValue([]);
    expect(await getSidebarAds(ctx(), monday8)).toEqual({ hidden: false, ads: [] });
  });

  it("is hidden inside a platform support session, for platform users and when ads are switched off", async () => {
    expect((await getSidebarAds(ctx({ supportAccessId: "s1" }), monday8)).hidden).toBe(true);
    expect((await getSidebarAds(ctx({ companyId: null }), monday8)).hidden).toBe(true);
    h.settingsFind.mockResolvedValue({ hideAds: true });
    expect(await getSidebarAds(ctx(), monday8)).toEqual({ hidden: true, ads: [] });
    expect(h.adFindMany).not.toHaveBeenCalled();
  });

  it("counts a view or click only for an ad that is live for that company", async () => {
    await recordAdView(ctx(), "a", monday8);
    expect(h.adUpdate).toHaveBeenCalledTimes(1);
    await recordAdView(ctx(), "not-live", monday8);
    expect(h.adUpdate).toHaveBeenCalledTimes(1);
    expect(await recordAdClick(ctx(), "a", monday8)).toBe("https://a.co.za/");
    expect(await recordAdClick(ctx(), "not-live", monday8)).toBeNull();
    expect(await recordAdClick(ctx({ supportAccessId: "s1" }), "a", monday8)).toBeNull();
  });

  it("only a platform administrator with configuration permission can create ads", async () => {
    await expect(createAd(ctx({ companyId: null }), valid)).rejects.toThrow();
    await expect(createAd(ctx({ companyId: "c1", platformPermissions: new Set(["PLATFORM_CONFIGURATION_MANAGE"]) as never }), valid)).rejects.toThrow("PLATFORM_CONTEXT_REQUIRED");
    h.adCreate.mockResolvedValue({ ...row("n"), views: 0, clicks: 0, updatedAt: new Date(), createdAt: new Date() });
    await createAd(ctx({ companyId: null, platformPermissions: new Set(["PLATFORM_CONFIGURATION_MANAGE"]) as never }), valid);
    expect(h.adCreate.mock.calls[0][0]).toMatchObject({ data: { advertiser: "HydroTech", linkUrl: "https://hydrotech.co.za/", audience: "ALL", companyIds: [], createdById: "u1" } });
    expect(h.auditCreate).toHaveBeenCalled();
  });
});
