import { z } from "zod";

// 2026-10-23, user request: Platform > Advertising. Pure rules for the advertising block (no database, no browser code), so the
// platform screen, the sidebar API and the tests all use the same timeslot maths.
//
// A timeslot is a weekly window inside a date range, in South African time (Africa/Johannesburg, UTC+2 all year):
//   { days: [0..6] (Monday = 0), from: "08:00", to: "12:00", startDate: "2026-11-01", endDate: "2026-11-30" }
// An ad has up to MAX_SLOTS (10) of them and is live while ANY of its slots is. When several ads are live for a company at
// the same moment they rotate (the sidebar steps through them); when none is live the sidebar shows Flo X's own card.

export const MAX_SLOTS = 10;
export const AD_TIME_ZONE = "Africa/Johannesburg";
export const MAX_AD_IMAGE_BYTES = 400 * 1024;
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 08:00.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-01.");

export const adSlotSchema = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).min(1, "Tick at least one day.").max(7),
    from: hhmm,
    to: hhmm,
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((slot) => slot.from < slot.to, { message: "The end time must be after the start time.", path: ["to"] })
  .refine((slot) => slot.startDate <= slot.endDate, { message: "The end date must not be before the start date.", path: ["endDate"] });
export type AdSlot = z.infer<typeof adSlotSchema>;

/** Only http(s) links; anything else (javascript:, data: ...) is refused. */
export function normalizeAdLink(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const short = (max: number) => z.string().trim().max(max);

export const adInputSchema = z
  .object({
    advertiser: short(120).min(1, "Enter the advertiser's name."),
    headline: short(80).min(1, "Enter a headline."),
    body: short(160).optional().default(""),
    buttonText: short(24).optional().default("Learn more"),
    linkUrl: z.string().trim().max(500),
    active: z.boolean().default(true),
    audience: z.enum(["ALL", "SELECTED"]).default("ALL"),
    companyIds: z.array(z.string().min(1).max(60)).max(500).default([]),
    slots: z.array(adSlotSchema).max(MAX_SLOTS, `An ad can have at most ${MAX_SLOTS} timeslots.`).default([]),
  })
  .superRefine((ad, ctx) => {
    if (!normalizeAdLink(ad.linkUrl)) ctx.addIssue({ code: "custom", path: ["linkUrl"], message: "Enter a web address starting with http:// or https://." });
    if (ad.audience === "SELECTED" && ad.companyIds.length === 0) ctx.addIssue({ code: "custom", path: ["companyIds"], message: "Choose at least one company, or show the ad to all companies." });
  });
export type AdInput = z.infer<typeof adInputSchema>;

export type LiveAdCandidate = {
  id: string;
  active: boolean;
  audience: "ALL" | "SELECTED";
  companyIds: string[];
  slots: unknown;
  createdAt: Date | string;
};

/** Clock time in South Africa for an instant: date "YYYY-MM-DD", minutes since midnight, weekday (Monday = 0). */
const LOCAL_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: AD_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function localParts(now: Date): { date: string; minutes: number; weekday: number } {
  const parts = LOCAL_FORMAT.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return { date, minutes, weekday };
}

const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export function parseSlots(raw: unknown): AdSlot[] {
  const list = Array.isArray(raw) ? raw : [];
  const slots: AdSlot[] = [];
  for (const item of list) {
    const parsed = adSlotSchema.safeParse(item);
    if (parsed.success) slots.push(parsed.data);
  }
  return slots.slice(0, MAX_SLOTS);
}

export function isSlotLive(slot: AdSlot, now: Date): boolean {
  const local = localParts(now);
  if (local.date < slot.startDate || local.date > slot.endDate) return false;
  if (!slot.days.includes(local.weekday)) return false;
  return local.minutes >= toMinutes(slot.from) && local.minutes < toMinutes(slot.to);
}

export function isAdLive(ad: LiveAdCandidate, companyId: string, now: Date): boolean {
  if (!ad.active) return false;
  if (ad.audience === "SELECTED" && !ad.companyIds.includes(companyId)) return false;
  return parseSlots(ad.slots).some((slot) => isSlotLive(slot, now));
}

/** The ads to show a company right now, oldest first (the order they rotate in). Empty = show Flo X's own card. */
export function pickLiveAds<T extends LiveAdCandidate>(ads: T[], companyId: string, now: Date): T[] {
  return ads
    .filter((ad) => isAdLive(ad, companyId, now))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
}

/** The next time (within 60 days) an ad that is not live goes live, for the "Next: Tue 03/11 08:00" label. null = not scheduled. */
export function nextLiveLabel(slotsRaw: unknown, now: Date): string | null {
  const slots = parseSlots(slotsRaw);
  if (slots.length === 0) return null;
  const local = localParts(now);
  let best: { offset: number; minutes: number; date: string; weekday: number } | null = null;
  for (let offset = 0; offset <= 60; offset += 1) {
    const day = new Date(`${local.date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + offset);
    const date = day.toISOString().slice(0, 10);
    const weekday = (day.getUTCDay() + 6) % 7;
    for (const slot of slots) {
      if (date < slot.startDate || date > slot.endDate || !slot.days.includes(weekday)) continue;
      const start = toMinutes(slot.from);
      if (offset === 0 && start <= local.minutes) continue;
      if (!best || offset < best.offset || (offset === best.offset && start < best.minutes)) best = { offset, minutes: start, date, weekday };
    }
    if (best) break;
  }
  if (!best) return null;
  const hh = String(Math.floor(best.minutes / 60)).padStart(2, "0");
  const mm = String(best.minutes % 60).padStart(2, "0");
  return `${WEEKDAY_LABELS[best.weekday]} ${best.date.slice(8, 10)}/${best.date.slice(5, 7)} ${hh}:${mm}`;
}

/** Image types allowed for an ad (no SVG: it can carry scripts). Checks the file's first bytes, not just the name. */
export function sniffAdImage(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length > 12 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}
