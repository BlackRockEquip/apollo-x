import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error { code: string; constructor(message: string, opts: { code: string }) { super(message); this.code = opts.code; } } },
}));

const db = vi.hoisted(() => ({
  proposal: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  demoRequest: { findUnique: vi.fn() },
  platformSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  auditEvent: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  calcProposal, defaultPriceList, formatMoney, newProposalFromPriceList, normalizePriceList, priceListSchema, proposalDataSchema, addDays,
} from "@/lib/proposals/model";
import { renderProposalHtml, renderProposalPrintPage } from "@/lib/proposals/render";
import { createProposal, getPriceList, setProposalStatus, suggestNextNumber, updatePriceList } from "@/lib/proposals/service";
import type { RequestContext } from "@/lib/auth/context-types";

const NOW = new Date("2026-10-21T08:00:00Z");
const seed = () => newProposalFromPriceList(defaultPriceList(), "FX-Q-2026-0001", { company: "Karoo Hydraulics", contact: "Pieter" }, NOW);

describe("proposal price list", () => {
  it("the built-in sample list is valid and holds the mockup prices", () => {
    const list = defaultPriceList();
    expect(priceListSchema.safeParse(list).success).toBe(true);
    expect(list.platformFee).toBe(495);
    expect(list.products.map((p) => p.id)).toEqual(["workshop", "engineering", "mining", "sports"]);
  });
  it("falls back to the sample list when the stored one is damaged", () => {
    expect(normalizePriceList({ products: "nope" }).platformFee).toBe(495);
    expect(normalizePriceList(null).products).toHaveLength(4);
  });
  it("rejects negative prices", () => {
    const list = defaultPriceList();
    list.platformFee = -5;
    expect(priceListSchema.safeParse(list).success).toBe(false);
  });
});

describe("proposal maths", () => {
  it("prices the default selection (Workshop build, ticked modules, 3 users)", () => {
    const calc = calcProposal(seed());
    // once-off: set-up 7 500 + import 2 500 + 2 x training 1 800 = 13 600, plus 15% VAT
    expect(calc.onceTotals.sub).toBe(13600);
    expect(calc.onceTotals.total).toBe(15640);
    // monthly: modules 950+650+450+750+350 = 3 150 + platform fee 495 = 3 645, plus 15% VAT
    expect(calc.monthlyTotals.sub).toBe(3645);
    expect(calc.monthlyTotals.vat).toBe(546.75);
    expect(calc.monthlyTotals.total).toBe(4191.75);
  });
  it("adds extra users and applies discounts before VAT", () => {
    const data = seed();
    data.services.users = 6; // 3 extra at R95
    data.services.discountMonthly = 10;
    const calc = calcProposal(data);
    expect(calc.monthly.at(-1)).toMatchObject({ qty: 3, unit: 95 });
    expect(calc.monthlyTotals.sub).toBe(3930);
    expect(calc.monthlyTotals.discount).toBe(393);
    expect(calc.monthlyTotals.net).toBe(3537);
    expect(calc.monthlyTotals.total).toBe(4067.55);
  });
  it("is all zero when no product is chosen", () => {
    const data = seed();
    data.products.forEach((p) => { p.included = false; });
    const calc = calcProposal(data);
    expect(calc.once).toHaveLength(0);
    expect(calc.monthly).toHaveLength(0);
  });
  it("ignores unticked modules and bad numbers", () => {
    const data = seed();
    data.products[0].modules.forEach((m) => { m.included = false; });
    data.products[0].modules[0].included = true;
    data.products[0].modules[0].price = Number.NaN;
    expect(calcProposal(data).monthly.filter((r) => r.label === "Jobs & WIP")[0].unit).toBe(0);
  });
  it("formats rand amounts and dates", () => {
    expect(formatMoney(12345.5)).toBe("R 12 345,50");
    expect(addDays("2026-10-21", 30)).toBe("2026-11-20");
  });
});

describe("proposal document", () => {
  it("escapes everything typed in", () => {
    const data = seed();
    data.client.company = '<img src=x onerror=alert(1)> & "Co"';
    data.letter = "Dear {contact}, <b>hi</b> {client}";
    const html = renderProposalHtml(data);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>hi</b>");
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("Dear Pieter");
  });
  it("shows the totals, validity date and the signature block", () => {
    const html = renderProposalHtml(seed());
    expect(html).toContain("Valid until: 20 November 2026");
    expect(html).not.toContain("First 12 months");
    expect(html).toContain("Once-off (incl. VAT)");
    expect(html).toContain("Per month (incl. VAT)");
    expect(html).toContain("Signature and date");
  });
  it("makes a complete print page", () => {
    const page = renderProposalPrintPage(seed());
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain("window.print()");
  });
  it("puts an Initials box on every printed page and keeps each section whole", () => {
    const page = renderProposalPrintPage(seed());
    expect(page).toContain('<div class="initials">Initials</div>');
    expect(page).toContain("position:fixed");
    expect(page).toContain("break-inside:avoid");
    expect(page).toContain('class="blk"');
  });
});

describe("proposal validation", () => {
  it("needs a client company", () => {
    const data = seed();
    expect(proposalDataSchema.safeParse(data).success).toBe(true);
    data.client.company = "  ";
    expect(proposalDataSchema.safeParse(data).success).toBe(false);
  });
});

function ctx(perms: string[], companyId: string | null = null) {
  return { userId: "u1", displayName: "Mornay", correlationId: "c1", companyId, platformPermissions: new Set(perms) } as unknown as RequestContext;
}
const row = (over: Record<string, unknown> = {}) => ({
  id: "p1", number: "FX-Q-2026-0001", status: "DRAFT", clientCompany: "Karoo Hydraulics", contactName: "Pieter", onceOffTotal: 15640, monthlyTotal: 4191.75,
  demoRequestId: null, createdByName: "Mornay", createdAt: NOW, updatedAt: NOW, sentAt: null, decidedAt: null, ...over,
});

describe("proposal service", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("suggests the next number for the year", async () => {
    db.proposal.findFirst.mockResolvedValueOnce({ number: "FX-Q-2026-0007" });
    expect(await suggestNextNumber(NOW)).toBe("FX-Q-2026-0008");
    db.proposal.findFirst.mockResolvedValueOnce(null);
    expect(await suggestNextNumber(NOW)).toBe("FX-Q-2026-0001");
  });

  it("keeps the typed number, or takes the next free one when it is taken", async () => {
    db.proposal.findUnique.mockResolvedValueOnce(null);
    db.proposal.create.mockImplementation(async ({ data }: { data: { number: string } }) => row({ number: data.number }));
    const first = await createProposal(ctx(["PLATFORM_SUPPORT_WRITE"]), { data: seed() });
    expect(first.number).toBe("FX-Q-2026-0001");

    db.proposal.findUnique.mockResolvedValueOnce({ id: "other" });
    db.proposal.findFirst.mockResolvedValueOnce({ number: "FX-Q-2026-0001" });
    const second = await createProposal(ctx(["PLATFORM_SUPPORT_WRITE"]), { data: seed() });
    expect(second.number).toBe("FX-Q-2026-0002");
    expect(db.auditEvent.create).toHaveBeenCalledTimes(2);
  });

  it("stores the once-off and monthly totals with the proposal", async () => {
    db.proposal.findUnique.mockResolvedValueOnce(null);
    db.proposal.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row(data));
    await createProposal(ctx(["PLATFORM_SUPPORT_WRITE"]), { data: seed() });
    const arg = db.proposal.create.mock.calls[0][0].data;
    expect(arg.onceOffTotal).toBe(15640);
    expect(arg.monthlyTotal).toBe(4191.75);
    expect(arg.status).toBe("DRAFT");
  });

  it("stamps sent and decided dates when the status moves", async () => {
    db.proposal.findUnique.mockResolvedValue({ id: "p1", status: "DRAFT", sentAt: null });
    db.proposal.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row(data));
    await setProposalStatus(ctx(["PLATFORM_SUPPORT_WRITE"]), "p1", { status: "SENT" });
    expect(db.proposal.update.mock.calls[0][0].data.sentAt).toBeInstanceOf(Date);
    expect(db.proposal.update.mock.calls[0][0].data.decidedAt).toBeNull();
    await setProposalStatus(ctx(["PLATFORM_SUPPORT_WRITE"]), "p1", { status: "ACCEPTED" });
    expect(db.proposal.update.mock.calls[1][0].data.decidedAt).toBeInstanceOf(Date);
    await setProposalStatus(ctx(["PLATFORM_SUPPORT_WRITE"]), "p1", { status: "DRAFT" });
    expect(db.proposal.update.mock.calls[2][0].data).toMatchObject({ sentAt: null, decidedAt: null });
  });

  it("only platform staff with the right permission can use it", async () => {
    await expect(createProposal(ctx(["PLATFORM_SUPPORT_READ"]), { data: seed() })).rejects.toThrow();
    await expect(createProposal(ctx(["PLATFORM_SUPPORT_WRITE"], "company-1"), { data: seed() })).rejects.toThrow("PLATFORM_CONTEXT_REQUIRED");
    await expect(updatePriceList(ctx(["PLATFORM_SUPPORT_WRITE"]), defaultPriceList())).rejects.toThrow();
  });

  it("reads the stored price list, or the sample one when none is stored", async () => {
    db.platformSettings.findUnique.mockResolvedValueOnce({ proposalPriceList: { ...defaultPriceList(), platformFee: 600 } });
    expect((await getPriceList(ctx(["PLATFORM_SUPPORT_READ"]))).platformFee).toBe(600);
    db.platformSettings.findUnique.mockResolvedValueOnce(null);
    expect((await getPriceList(ctx(["PLATFORM_CONFIGURATION_MANAGE"]))).platformFee).toBe(495);
  });
});
