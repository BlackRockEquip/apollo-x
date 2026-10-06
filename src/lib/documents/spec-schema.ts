import { z } from "zod";
import { DOCUMENT_KINDS } from "@/lib/documents/titles";
import type { DocBlock } from "@/lib/documents/pdf";

// Validation for the document the browser asks the server to render and save
// (POST /api/v1/jobs/[id]/documents). Bounded so a request cannot ask for an
// enormous PDF; everything is plain text — nothing is ever interpreted.
const shortText = z.string().max(2000);
const longText = z.string().max(20000);

const flatBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: shortText }),
  z.object({ type: z.literal("paragraph"), text: longText }),
  z.object({ type: z.literal("lines"), lines: z.array(shortText).max(60), bold: z.boolean().optional() }),
  z.object({ type: z.literal("kv"), rows: z.array(z.tuple([shortText, longText])).max(60) }),
  z.object({
    type: z.literal("table"),
    headers: z.array(shortText).min(1).max(10),
    rows: z.array(z.array(shortText).max(10)).max(1500),
    widths: z.array(z.number().positive().max(100)).max(10).optional(),
    center: z.array(z.number().int().min(0).max(9)).max(10).optional(),
  }),
  z.object({ type: z.literal("signatures"), labels: z.array(shortText).min(1).max(3), fields: z.array(shortText).max(6) }),
  z.object({ type: z.literal("pageBreak") }),
]);

const block: z.ZodType<DocBlock> = z.union([
  flatBlock,
  z.object({ type: z.literal("twoCol"), left: z.array(flatBlock).max(20), right: z.array(flatBlock).max(20) }),
]) as z.ZodType<DocBlock>;

export const saveJobDocumentInput = z.object({
  kind: z.enum(DOCUMENT_KINDS.map((k) => k.key) as [string, ...string[]]),
  /** Extra text added to the file name after the title, e.g. the supplier on an outwork delivery note. */
  nameSuffix: z.string().trim().max(80).optional(),
  spec: z.object({
    title: shortText.min(1),
    rightLines: z.array(shortText).max(6).optional(),
    blocks: z.array(block).max(80),
  }),
});
