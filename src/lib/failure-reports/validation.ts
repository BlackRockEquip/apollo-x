import { z } from "zod";
import { FIELD_KEYS, WARRANTY_VALUES } from "@/lib/failure-reports/model";

// Request shapes for the Failure Reports API (2026-11-25). Text limits are generous - the report is free text - but bounded.

const idShape = z.string().regex(/^[a-z0-9]{20,40}$/i);
const fieldsShape = z.object(Object.fromEntries(FIELD_KEYS.map((key) => [key, z.string().max(key === "intro" || key === "comments" ? 6000 : 300).optional()])) as Record<(typeof FIELD_KEYS)[number], z.ZodOptional<z.ZodString>>);
const listShape = z.array(z.string().max(200)).max(40);

export const reportCreateInput = z.object({
  jobId: idShape.nullish(),
  profileId: idShape.nullish(),
});

export const reportUpdateInput = z.object({
  fields: fieldsShape.partial().optional(),
  warranty: z.enum(WARRANTY_VALUES).optional(),
  perPage: z.number().int().min(1).max(4).optional(),
  descHeading: z.string().trim().max(40).optional(),
  profileId: idShape.nullable().optional(),
  replace: listShape.optional(),
  repair: listShape.optional(),
  missing: listShape.optional(),
});
export type ReportUpdateInput = z.infer<typeof reportUpdateInput>;

export const linkJobInput = z.object({
  jobId: idShape.nullable(),
  /** Refresh: replace fields the user changed too (asked first in the browser). */
  overwriteEdited: z.boolean().optional(),
});

const MAX_PHOTO_BASE64 = 11_000_000; // about 8 MB of image
export const photoAddInput = z.object({
  fileName: z.string().max(200).optional(),
  mimeType: z.enum(["image/jpeg", "image/png"]).default("image/jpeg"),
  contentBase64: z.string().min(10).max(MAX_PHOTO_BASE64),
  width: z.number().int().min(1).max(10000),
  height: z.number().int().min(1).max(10000),
  caption: z.string().max(3000).optional(),
});

export const photoUpdateInput = z.object({
  caption: z.string().max(3000).optional(),
  marks: z.array(z.unknown()).max(200).optional(),
  /** The photo rotated in the mark editor (a new image), with its new size. */
  image: z.object({ contentBase64: z.string().min(10).max(MAX_PHOTO_BASE64), width: z.number().int().min(1).max(10000), height: z.number().int().min(1).max(10000) }).optional(),
});

export const photoOrderInput = z.object({ order: z.array(idShape).max(300) });

const hex = z.string().trim().regex(/^#?[0-9a-f]{6}$/i).transform((v) => v.replace("#", "").toUpperCase());
export const profileInput = z.object({
  name: z.string().trim().min(1).max(120),
  legalName: z.string().trim().max(200).nullish(),
  logoData: z.string().max(3_000_000).regex(/^data:image\/(png|jpeg|webp);base64,/).nullish(),
  logoAspect: z.number().min(0.1).max(20).optional(),
  logoDark: z.boolean().optional(),
  accent: hex,
  dark: hex,
  accentText: hex.nullish(),
  headerStyle: z.enum(["auto", "light", "band"]).default("auto"),
  details: z.object({
    address: z.string().max(300).optional(), phone: z.string().max(200).optional(), email: z.string().max(200).optional(),
    website: z.string().max(200).optional(), coreg: z.string().max(100).optional(), vat: z.string().max(100).optional(), extra: z.string().max(200).optional(),
  }).default({}),
  footer: z.string().trim().max(200).nullish(),
  showDetails: z.boolean().default(false),
  isDefault: z.boolean().optional(),
});
export type ProfileInput = z.infer<typeof profileInput>;

export const createdInput = z.object({
  fileName: z.string().trim().min(1).max(160),
  /** The .pptx as made in the browser; saved in the linked job's files. Optional for a report with no job. */
  contentBase64: z.string().max(14_000_000).optional(),
});
