import { z } from "zod";

// 2026-10-21 — Platform > Proposals. Pure model + maths for Flo X's own sales proposals / quotations (no database or
// browser code in here, so the screen, the print view and the tests all use the same figures).
//
// Two shapes:
//  - PriceList: Flo X's editable price list (Platform Settings). Seeded with the sample prices from the mockup.
//  - ProposalData: one proposal. It is a SNAPSHOT of the price list taken when the proposal was created, with every
//    price editable on the proposal itself - later price-list changes never alter a proposal that already exists.

export type PriceModule = { id: string; name: string; description: string; price: number; defaultOn: boolean };
export type PriceProduct = { id: string; name: string; short: string; blurb: string; setup: number; modules: PriceModule[] };
export type PriceList = {
  products: PriceProduct[];
  /** Bullet list "Included with every plan". */
  included: string[];
  platformFee: number;
  usersIncluded: number;
  userPrice: number;
  importPrice: number;
  trainingPrice: number;
  vatPercent: number;
  validDays: number;
  preparedBy: string;
  preparedByEmail: string;
  /** {client} and {contact} are replaced when the proposal is shown. */
  letter: string;
  terms: string;
};

export type ProposalModule = { id: string; name: string; description: string; price: number; included: boolean };
export type ProposalProduct = { id: string; name: string; short: string; blurb: string; setup: number; included: boolean; modules: ProposalModule[] };
export type ProposalData = {
  client: { company: string; contact: string; email: string; phone: string; address: string };
  quote: { number: string; date: string; validDays: number; preparedBy: string; preparedByEmail: string };
  products: ProposalProduct[];
  services: {
    platformFeeOn: boolean; platformFee: number;
    users: number; usersIncluded: number; userPrice: number;
    importOn: boolean; importPrice: number;
    trainingOn: boolean; trainingQty: number; trainingPrice: number;
    discountOnceOff: number; discountMonthly: number;
    vatPercent: number;
  };
  included: string[];
  letter: string;
  terms: string;
};

export const PROPOSAL_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "DECLINED"] as const;
export type ProposalStatusValue = (typeof PROPOSAL_STATUSES)[number];
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatusValue, string> = { DRAFT: "Draft", SENT: "Sent", ACCEPTED: "Accepted", DECLINED: "Declined" };

// ---------------------------------------------------------------- default price list (sample prices)

const DEFAULT_LETTER = "Dear {contact},\n\nThank you for the opportunity to propose Flo X for {client}. Flo X is a modular management system: you switch on only the products and modules your business needs, and add more whenever you are ready.\n\nThis proposal sets out what we recommend, what it costs, and how we will get your team working on it. We would be glad to walk you through it in a short demo.\n\nKind regards";
const DEFAULT_TERMS = "1. Validity. Prices are valid for the number of days shown above and exclude changes in scope.\n2. Once-off fees are invoiced on acceptance. Monthly fees start on the go-live date and are invoiced monthly in advance, payable within 30 days.\n3. Users and modules can be added or removed at any time; monthly fees change from the next invoice.\n4. Your data belongs to you. Each organisation's data is kept separate, and you can export it at any time. Flo X processes personal information only to provide the service, in line with POPIA.\n5. Support is by email on working days. Software updates are included.\n6. Either party may end the monthly service with 30 days' written notice. Once-off fees are not refundable once work has started.\n7. All amounts are in South African Rand.";

export function defaultPriceList(): PriceList {
  const m = (id: string, name: string, description: string, price: number, defaultOn: boolean): PriceModule => ({ id, name, description, price, defaultOn });
  return {
    products: [
      { id: "workshop", name: "Workshop & Engineering – Workshop build", short: "Workshop", setup: 7500, blurb: "Job cards, parts, stock and PEX for repair, rebuild and field-service workshops.", modules: [
        m("jobs", "Jobs & WIP", "Job cards, status steps, notes, attachments, ETA and overdue tracking, printable job cards and delivery notes.", 950, true),
        m("parts", "Parts & ordering", "Parts lists per job, job kits, outstanding parts and supplier follow-ups.", 650, true),
        m("rfq", "RFQs & supplier quotes", "Send requests to suppliers by email, capture quotes and compare prices.", 450, true),
        m("stock", "Stock & pick slips", "Stock levels, bins, reservations and pick slips that take parts from stock to the job.", 750, true),
        m("pex", "PEX exchange units", "Supply, return and redeploy exchange units with a traceable history.", 550, false),
        m("out", "Outwork", "Track components sent to other shops and the paperwork that goes with them.", 350, false),
        m("field", "Field service", "Plan site visits, record what was done and print field reports.", 450, false),
        m("rep", "Reports", "Jobs per customer, warranty, monthly trends, delivery and turnaround.", 350, true),
      ] },
      { id: "engineering", name: "Workshop & Engineering – Engineering build", short: "Engineering", setup: 7500, blurb: "The same job flow for machining shops, with recorded dimensions and no supplier RFQs.", modules: [
        m("jobs", "Jobs & WIP", "Job cards, machinist ETAs, overdue days, document checks before delivery.", 950, true),
        m("spec", "Specifications & size reports", "Dimensions recorded on arrival and after machining, with the original sheet kept on file.", 650, true),
        m("stock", "Stock & pick slips", "Stock, bins and pick slips for material and parts.", 750, false),
        m("out", "Outwork", "Track work sent to other shops.", 350, false),
        m("rep", "Reports", "Turnaround, on-time delivery and repeat-customer reports.", 350, true),
      ] },
      { id: "mining", name: "Mining Fleet Management", short: "Mining fleet", setup: 12500, blurb: "Know which machines are working, which are down and which are due.", modules: [
        m("fleet", "Fleet & asset register", "Every machine with hours, location, status and history.", 1200, true),
        m("pm", "Planned maintenance", "Services due by hours or date, so nothing is missed.", 950, true),
        m("bd", "Breakdowns & work orders", "Log a fault, raise the work order and track it until the machine is back.", 850, true),
        m("comp", "Component change-outs", "Follow engines, gearboxes and cylinders through exchange and rebuild.", 650, false),
        m("stock", "Parts, stock & pick slips", "Issue parts from stock to work orders.", 750, false),
        m("out", "Contractors & outwork", "Work sent to specialist shops and contractors.", 350, false),
        m("avail", "Availability & downtime reports", "Where the hours are going, per machine and per period.", 450, true),
      ] },
      { id: "sports", name: "Sports League Management", short: "Sports league", setup: 5000, blurb: "Fixtures, results and log tables for leagues, schools and councils.", modules: [
        m("league", "Leagues, seasons & divisions", "Run several competitions side by side.", 750, true),
        m("teams", "Teams & players", "Registers for every team, with contact details.", 450, true),
        m("fix", "Fixtures & results", "Schedule rounds, capture scores, handle postponements.", 650, true),
        m("log", "Log tables", "Points, wins and positions calculated automatically.", 350, true),
        m("off", "Officials & venues", "Appoint referees and manage grounds and courts.", 350, false),
        m("rep", "Reports & printing", "Printable fixtures, results and tables.", 250, false),
      ] },
    ],
    included: ["Secure hosting and daily backups", "Your logo and colours on screens and documents", "Company set-up and user creation by Flo X", "Role-based access for every user", "Email support and software updates", "Print and PDF of documents and reports"],
    platformFee: 495,
    usersIncluded: 3,
    userPrice: 95,
    importPrice: 2500,
    trainingPrice: 1800,
    vatPercent: 15,
    validDays: 30,
    preparedBy: "Mornay Rossouw",
    preparedByEmail: "sales@floxintegrations.co.za",
    letter: DEFAULT_LETTER,
    terms: DEFAULT_TERMS,
  };
}

// ---------------------------------------------------------------- validation

const money = z.number().finite().min(0).max(100_000_000);
const short = (max: number) => z.string().trim().max(max);
const idString = z.string().trim().min(1).max(60);

export const priceListSchema = z.object({
  products: z.array(z.object({
    id: idString,
    name: short(160).min(1),
    short: short(60).min(1),
    blurb: short(500),
    setup: money,
    modules: z.array(z.object({ id: idString, name: short(160).min(1), description: short(600), price: money, defaultOn: z.boolean() })).max(60),
  })).max(20),
  included: z.array(short(200).min(1)).max(30),
  platformFee: money,
  usersIncluded: z.number().int().min(0).max(100000),
  userPrice: money,
  importPrice: money,
  trainingPrice: money,
  vatPercent: z.number().min(0).max(100),
  validDays: z.number().int().min(1).max(3650),
  preparedBy: short(120),
  preparedByEmail: short(200),
  letter: short(6000),
  terms: short(12000),
});

export const proposalDataSchema = z.object({
  client: z.object({ company: short(200).min(1, "Enter the client's company name."), contact: short(200), email: short(200), phone: short(60), address: short(400) }),
  quote: z.object({ number: short(60).min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), validDays: z.number().int().min(1).max(3650), preparedBy: short(120), preparedByEmail: short(200) }),
  products: z.array(z.object({
    id: idString, name: short(160).min(1), short: short(60), blurb: short(500), setup: money, included: z.boolean(),
    modules: z.array(z.object({ id: idString, name: short(160).min(1), description: short(600), price: money, included: z.boolean() })).max(60),
  })).max(20),
  services: z.object({
    platformFeeOn: z.boolean(), platformFee: money,
    users: z.number().int().min(1).max(100000), usersIncluded: z.number().int().min(0).max(100000), userPrice: money,
    importOn: z.boolean(), importPrice: money,
    trainingOn: z.boolean(), trainingQty: z.number().int().min(0).max(1000), trainingPrice: money,
    discountOnceOff: z.number().min(0).max(100), discountMonthly: z.number().min(0).max(100),
    vatPercent: z.number().min(0).max(100),
  }),
  included: z.array(short(200).min(1)).max(30),
  letter: short(6000),
  terms: short(12000),
});

/** Merge whatever was stored with the built-in defaults so a half-filled or older price list never breaks the screens. */
export function normalizePriceList(raw: unknown): PriceList {
  const parsed = priceListSchema.safeParse(raw);
  return parsed.success ? parsed.data : defaultPriceList();
}

// ---------------------------------------------------------------- building a new proposal

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** First proposal state: copies the price list (default modules ticked, first product on) and any client details. */
export function newProposalFromPriceList(list: PriceList, number: string, client?: Partial<ProposalData["client"]>, now = new Date()): ProposalData {
  return {
    client: { company: client?.company ?? "", contact: client?.contact ?? "", email: client?.email ?? "", phone: client?.phone ?? "", address: client?.address ?? "" },
    quote: { number, date: todayIso(now), validDays: list.validDays, preparedBy: list.preparedBy, preparedByEmail: list.preparedByEmail },
    products: list.products.map((p, index) => ({
      id: p.id, name: p.name, short: p.short, blurb: p.blurb, setup: p.setup, included: index === 0,
      modules: p.modules.map((m) => ({ id: m.id, name: m.name, description: m.description, price: m.price, included: m.defaultOn })),
    })),
    services: {
      platformFeeOn: true, platformFee: list.platformFee,
      users: Math.max(1, list.usersIncluded), usersIncluded: list.usersIncluded, userPrice: list.userPrice,
      importOn: true, importPrice: list.importPrice,
      trainingOn: true, trainingQty: 2, trainingPrice: list.trainingPrice,
      discountOnceOff: 0, discountMonthly: 0,
      vatPercent: list.vatPercent,
    },
    included: [...list.included],
    letter: list.letter,
    terms: list.terms,
  };
}

// ---------------------------------------------------------------- maths

export type PriceRow = { label: string; note?: string; qty: number; unit: number };
export type Totals = { sub: number; discount: number; net: number; vat: number; total: number };
export type ProposalCalc = {
  picks: { name: string; blurb: string; modules: { name: string; description: string; price: number }[] }[];
  once: PriceRow[];
  monthly: PriceRow[];
  onceTotals: Totals;
  monthlyTotals: Totals;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

function totals(rows: PriceRow[], discountPct: number, vatPct: number): Totals {
  const sub = r2(rows.reduce((sum, row) => sum + nonNeg(row.qty) * nonNeg(row.unit), 0));
  const discount = r2((sub * Math.min(100, nonNeg(discountPct))) / 100);
  const net = r2(sub - discount);
  const vat = r2((net * nonNeg(vatPct)) / 100);
  return { sub, discount, net, vat, total: r2(net + vat) };
}

export function calcProposal(data: ProposalData): ProposalCalc {
  const s = data.services;
  const chosen = data.products.filter((p) => p.included);
  const picks = chosen.map((p) => ({ name: p.name, blurb: p.blurb, modules: p.modules.filter((m) => m.included).map((m) => ({ name: m.name, description: m.description, price: nonNeg(m.price) })) }));
  const once: PriceRow[] = [];
  const monthly: PriceRow[] = [];
  for (const p of chosen) {
    once.push({ label: `${p.name} – set-up and configuration`, qty: 1, unit: nonNeg(p.setup) });
    for (const m of p.modules) if (m.included) monthly.push({ label: m.name, note: p.short || p.name, qty: 1, unit: nonNeg(m.price) });
  }
  if (chosen.length) {
    if (s.importOn) once.push({ label: "Data import (customers, suppliers, parts)", qty: 1, unit: nonNeg(s.importPrice) });
    if (s.trainingOn && s.trainingQty > 0) once.push({ label: "Training sessions (half-day)", qty: Math.round(s.trainingQty), unit: nonNeg(s.trainingPrice) });
    if (s.platformFeeOn) monthly.unshift({ label: `Flo X platform fee (hosting, backups, support, ${s.usersIncluded} users included)`, qty: 1, unit: nonNeg(s.platformFee) });
    const extra = Math.max(0, Math.round(s.users) - Math.round(s.usersIncluded));
    if (extra > 0) monthly.push({ label: `Additional users (${Math.round(s.users)} in total)`, qty: extra, unit: nonNeg(s.userPrice) });
  }
  const onceTotals = totals(once, s.discountOnceOff, s.vatPercent);
  const monthlyTotals = totals(monthly, s.discountMonthly, s.vatPercent);
  return { picks, once, monthly, onceTotals, monthlyTotals };
}

export function formatMoney(n: number): string {
  const fixed = r2(n).toFixed(2);
  const [whole, cents] = fixed.split(".");
  return `R ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${cents}`;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatLongDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
