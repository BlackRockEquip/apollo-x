import { z } from "zod";
import { normalizeAdLink } from "@/lib/ads/model";

// 2026-10-27, user request: platform broadcasts. The pure parts (input rules, the state a broadcast is in, the row shape the
// screen shows) live here, away from the database, so they can be tested and imported by the client component.

const KINDS = ["INFORMATION", "IMPORTANT", "MAINTENANCE"] as const;
const AUDIENCES = ["ALL", "COMPANIES", "USERS"] as const;
export type BroadcastKind = (typeof KINDS)[number];
export type BroadcastAudience = (typeof AUDIENCES)[number];
export type BroadcastState = "scheduled" | "showing" | "expired" | "withdrawn";

export const broadcastInputSchema = z
  .object({
    title: z.string().trim().min(1, "Give the message a title.").max(120),
    message: z.string().trim().min(1, "Write the message.").max(1000),
    linkUrl: z.string().trim().max(500).optional().default(""),
    kind: z.enum(KINDS),
    audience: z.enum(AUDIENCES),
    companyIds: z.array(z.string().min(1)).max(500).default([]),
    userIds: z.array(z.string().min(1)).max(2000).default([]),
    sendEmail: z.boolean().default(false),
    requireAck: z.boolean().default(false),
    /** ISO time; empty / null = send now. */
    startsAt: z.string().datetime().nullable().optional(),
    /** ISO time; empty / null = stays until withdrawn. */
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.audience === "COMPANIES" && value.companyIds.length === 0) ctx.addIssue({ code: "custom", path: ["companyIds"], message: "Choose at least one company." });
    if (value.audience === "USERS" && value.userIds.length === 0) ctx.addIssue({ code: "custom", path: ["userIds"], message: "Choose at least one user." });
    if (value.linkUrl && !normalizeAdLink(value.linkUrl)) ctx.addIssue({ code: "custom", path: ["linkUrl"], message: "Use a web address starting with http:// or https://." });
    if (value.expiresAt && value.startsAt && new Date(value.expiresAt) <= new Date(value.startsAt)) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "It must stop showing after it starts." });
  });

export type BroadcastRow = {
  id: string;
  title: string;
  message: string;
  linkUrl: string | null;
  kind: BroadcastKind;
  audience: BroadcastAudience;
  companyNames: string[];
  state: BroadcastState;
  sendEmail: boolean;
  requireAck: boolean;
  startsAt: string;
  expiresAt: string | null;
  recipientCount: number;
  companyCount: number;
  emailedCount: number;
  readCount: number;
  createdByName: string;
  createdAt: string;
};
export type BroadcastCompanyOption = { id: string; name: string; code: string; status: string; userCount: number };
export type BroadcastUserOption = { userId: string; name: string; email: string; companies: string[] };

export function broadcastState(b: { deliveredAt: Date | null; withdrawnAt: Date | null; expiresAt: Date | null }, now: Date): BroadcastState {
  if (b.withdrawnAt) return "withdrawn";
  if (!b.deliveredAt) return "scheduled";
  if (b.expiresAt && b.expiresAt <= now) return "expired";
  return "showing";
}

