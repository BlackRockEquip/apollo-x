import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { StockError } from "@/lib/http/errors";
import { MAX_AD_IMAGE_BYTES, adInputSchema, isSlotLive, nextLiveLabel, normalizeAdLink, parseSlots, pickLiveAds, sniffAdImage, type AdSlot } from "@/lib/ads/model";

// 2026-10-23, user request: Platform > Advertising + the ad block in every company's sidebar.
// Platform side (create / edit / images / lists) = PLATFORM_CONFIGURATION_MANAGE, platform context only.
// Company side: the sidebar asks for the ads that are live for ITS company right now; nothing is shown inside a platform support
// session or for a company where a platform admin has switched ads off (Platform > Companies > company).

export type AdRow = {
  id: string;
  advertiser: string;
  headline: string;
  body: string;
  buttonText: string;
  linkUrl: string;
  active: boolean;
  audience: "ALL" | "SELECTED";
  companyIds: string[];
  slots: AdSlot[];
  hasImage: boolean;
  imageVersion: number;
  views: number;
  clicks: number;
  /** "live" = showing now to at least one company, "scheduled" = has a future slot, "idle" = no slots / out of dates, "paused". */
  state: "live" | "scheduled" | "idle" | "paused";
  nextLive: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdCompanyOption = { id: string; name: string; code: string };

const adSelect = {
  id: true, advertiser: true, headline: true, body: true, buttonText: true, linkUrl: true, active: true, audience: true, companyIds: true, slots: true,
  imageVersion: true, views: true, clicks: true, createdAt: true, updatedAt: true,
} satisfies Prisma.AdvertisementSelect;
type AdRecord = Prisma.AdvertisementGetPayload<{ select: typeof adSelect }>;

function requirePlatformAds(ctx: RequestContext) {
  requirePlatformPermission(ctx, "PLATFORM_CONFIGURATION_MANAGE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
}

function toRow(record: AdRecord, hasImage: boolean, now: Date): AdRow {
  const slots = parseSlots(record.slots);
  // "Live now" ignores which company, so use the audience as if every company were chosen.
  const live = record.active && slots.some((slot) => isSlotLive(slot, now));
  const next = record.active && !live ? nextLiveLabel(slots, now) : null;
  return {
    id: record.id,
    advertiser: record.advertiser,
    headline: record.headline,
    body: record.body ?? "",
    buttonText: record.buttonText,
    linkUrl: record.linkUrl,
    active: record.active,
    audience: record.audience,
    companyIds: record.companyIds,
    slots,
    hasImage,
    imageVersion: record.imageVersion,
    views: record.views,
    clicks: record.clicks,
    state: !record.active ? "paused" : live ? "live" : next ? "scheduled" : "idle",
    nextLive: next,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function audit(ctx: RequestContext, entityId: string, action: string, afterData: Prisma.InputJsonValue, beforeData?: Prisma.InputJsonValue) {
  await prisma.auditEvent.create({
    data: { actorId: ctx.userId, source: "PLATFORM", module: "PLATFORM", entityType: "Advertisement", entityId, action, correlationId: ctx.correlationId, afterData, ...(beforeData ? { beforeData } : {}) },
  });
}

export async function listAds(ctx: RequestContext, now = new Date()): Promise<{ ads: AdRow[]; companies: AdCompanyOption[] }> {
  requirePlatformAds(ctx);
  const [records, withImage, companies] = await Promise.all([
    prisma.advertisement.findMany({ orderBy: [{ createdAt: "asc" }], select: adSelect }),
    prisma.advertisement.findMany({ where: { imageMime: { not: null } }, select: { id: true } }),
    prisma.company.findMany({ orderBy: [{ legalName: "asc" }], select: { id: true, internalCode: true, legalName: true, tradingName: true } }),
  ]);
  const imageIds = new Set(withImage.map((row) => row.id));
  return {
    ads: records.map((record) => toRow(record, imageIds.has(record.id), now)),
    companies: companies.map((company) => ({ id: company.id, name: company.tradingName || company.legalName, code: company.internalCode })),
  };
}

function dataFrom(input: ReturnType<typeof adInputSchema.parse>) {
  return {
    advertiser: input.advertiser,
    headline: input.headline,
    body: input.body || null,
    buttonText: input.buttonText,
    linkUrl: normalizeAdLink(input.linkUrl) as string,
    active: input.active,
    audience: input.audience,
    companyIds: input.audience === "SELECTED" ? Array.from(new Set(input.companyIds)) : [],
    slots: input.slots as unknown as Prisma.InputJsonValue,
  };
}

export async function createAd(ctx: RequestContext, raw: unknown): Promise<AdRow> {
  requirePlatformAds(ctx);
  const input = adInputSchema.parse(raw);
  const record = await prisma.advertisement.create({ data: { ...dataFrom(input), createdById: ctx.userId }, select: adSelect });
  await audit(ctx, record.id, "AD_CREATED", { advertiser: record.advertiser, headline: record.headline, audience: record.audience, slots: input.slots.length });
  return toRow(record, false, new Date());
}

export async function updateAd(ctx: RequestContext, id: string, raw: unknown): Promise<AdRow> {
  requirePlatformAds(ctx);
  const input = adInputSchema.parse(raw);
  const before = await prisma.advertisement.findUnique({ where: { id }, select: { ...adSelect, imageMime: true } });
  if (!before) throw new Error("RESOURCE_NOT_FOUND");
  const record = await prisma.advertisement.update({ where: { id }, data: dataFrom(input), select: adSelect });
  await audit(ctx, id, "AD_UPDATED", { advertiser: record.advertiser, headline: record.headline, active: record.active, audience: record.audience, slots: input.slots.length }, { advertiser: before.advertiser, headline: before.headline, active: before.active, audience: before.audience });
  return toRow(record, Boolean(before.imageMime), new Date());
}

export async function deleteAd(ctx: RequestContext, id: string): Promise<void> {
  requirePlatformAds(ctx);
  const before = await prisma.advertisement.findUnique({ where: { id }, select: { id: true, advertiser: true, headline: true } });
  if (!before) throw new Error("RESOURCE_NOT_FOUND");
  await prisma.advertisement.delete({ where: { id } });
  await audit(ctx, id, "AD_DELETED", { advertiser: before.advertiser, headline: before.headline });
}

export async function setAdImage(ctx: RequestContext, id: string, bytes: Uint8Array): Promise<{ imageVersion: number }> {
  requirePlatformAds(ctx);
  if (bytes.length === 0) throw new StockError("AD_IMAGE_EMPTY", "Choose an image file.");
  if (bytes.length > MAX_AD_IMAGE_BYTES) throw new StockError("AD_IMAGE_TOO_LARGE", `The image is too large. Use a file under ${Math.round(MAX_AD_IMAGE_BYTES / 1024)} KB.`);
  const mime = sniffAdImage(bytes);
  if (!mime) throw new StockError("AD_IMAGE_TYPE", "Use a PNG, JPG or WebP image.");
  const exists = await prisma.advertisement.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new Error("RESOURCE_NOT_FOUND");
  const updated = await prisma.advertisement.update({ where: { id }, data: { imageData: Buffer.from(bytes), imageMime: mime, imageVersion: { increment: 1 } }, select: { imageVersion: true } });
  await audit(ctx, id, "AD_IMAGE_SET", { bytes: bytes.length, mime });
  return updated;
}

export async function removeAdImage(ctx: RequestContext, id: string): Promise<void> {
  requirePlatformAds(ctx);
  const result = await prisma.advertisement.updateMany({ where: { id }, data: { imageData: null, imageMime: null, imageVersion: { increment: 1 } } });
  if (result.count === 0) throw new Error("RESOURCE_NOT_FOUND");
  await audit(ctx, id, "AD_IMAGE_REMOVED", {});
}

/** The picture of an ad (any signed-in user: it is shown in the sidebar and on the platform screen). */
export async function getAdImage(id: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const row = await prisma.advertisement.findUnique({ where: { id }, select: { imageData: true, imageMime: true } });
  if (!row?.imageData || !row.imageMime) return null;
  return { bytes: Buffer.from(row.imageData), mime: row.imageMime };
}

// ---------------------------------------------------------------- company side

export type SidebarAd = { id: string; advertiser: string; headline: string; body: string; buttonText: string; imageUrl: string | null };
export type SidebarAds = { hidden: boolean; ads: SidebarAd[] };

async function liveAdsFor(ctx: RequestContext, now: Date) {
  if (!ctx.companyId || ctx.supportAccessId) return null;
  const settings = await prisma.companySettings.findUnique({ where: { companyId: ctx.companyId }, select: { hideAds: true } });
  if (settings?.hideAds) return null;
  const records = await prisma.advertisement.findMany({ where: { active: true }, select: { id: true, advertiser: true, headline: true, body: true, buttonText: true, linkUrl: true, imageVersion: true, imageMime: true, active: true, audience: true, companyIds: true, slots: true, createdAt: true } });
  return pickLiveAds(records, ctx.companyId, now);
}

export async function getSidebarAds(ctx: RequestContext, now = new Date()): Promise<SidebarAds> {
  const live = await liveAdsFor(ctx, now);
  if (!live) return { hidden: true, ads: [] };
  return {
    hidden: false,
    ads: live.map((ad) => ({ id: ad.id, advertiser: ad.advertiser, headline: ad.headline, body: ad.body ?? "", buttonText: ad.buttonText, imageUrl: ad.imageMime ? `/api/v1/ads/${ad.id}/image?v=${ad.imageVersion}` : null })),
  };
}

/** Counts a view, only when that ad really is live for this company right now. */
export async function recordAdView(ctx: RequestContext, id: string, now = new Date()): Promise<void> {
  const live = await liveAdsFor(ctx, now);
  if (!live?.some((ad) => ad.id === id)) return;
  await prisma.advertisement.update({ where: { id }, data: { views: { increment: 1 } }, select: { id: true } });
}

/** Counts a click and returns the address to send the browser to (null = not a live ad for this company). */
export async function recordAdClick(ctx: RequestContext, id: string, now = new Date()): Promise<string | null> {
  const live = await liveAdsFor(ctx, now);
  const ad = live?.find((row) => row.id === id);
  if (!ad) return null;
  await prisma.advertisement.update({ where: { id }, data: { clicks: { increment: 1 } }, select: { id: true } });
  return normalizeAdLink(ad.linkUrl);
}
