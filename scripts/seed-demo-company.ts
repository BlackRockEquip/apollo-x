// Creates (or resets) the "Test Demo" company: a fully populated workshop that a
// salesperson can use to demonstrate Apollo X to prospective clients.
//
// What it builds: the company with every module switched on, numbering, six
// demo logins (one per role), manufacturers, storage bins, suppliers (with the
// brands they deal in), customers with contacts, a parts catalogue with stock
// on hand, mechanics and sales representatives, and about twenty jobs spread
// across every job type and status (parts lists, reserved stock, an RFQ with
// saved quotes, outwork, a field service report, a warranty claim, a PEX supply
// and a picking slip).
//
// Only the "Test Demo" company is ever touched. Nothing is emailed: the demo
// company has no SMTP settings and every address uses example.com.
//
// Run with:
//   npx tsx scripts/seed-demo-company.ts            (creates it; stops if it already exists)
//   npx tsx scripts/seed-demo-company.ts --reset    (wipes Test Demo and rebuilds it fresh)
//
// Optional: DEMO_PASSWORD=... sets the password used by all demo logins.
import { ModuleKey, TenantRole } from "@prisma/client";
import type { RequestContext } from "../src/lib/auth/context-types";
import { TENANT_PERMISSIONS } from "../src/lib/auth/permissions";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/security/passwords";
import { BLACK_ROCK_INTERNAL_CODE } from "../src/lib/constants";
import { createMaster } from "../src/lib/master-data/service";
import { receiveStock, createPickSlipForJob } from "../src/lib/inventory/service";
import { createMechanic, createSalesRepresentative } from "../src/lib/users/service";
import {
  addOutworkItems,
  addPartLinesBulk,
  changeJobStatus,
  closeJob,
  createJob,
  markPartLineReceived,
    updatePartLineOrder,
  upsertJobFieldService,
  upsertJobWarranty,
} from "../src/lib/jobs/service";
import { recordRfqQuote, requestRfqFromSupplier, saveRfqQuoteLines, setPreferredQuoteLine } from "../src/lib/rfq/service";

const COMPANY_CODE = "TEST_DEMO";
const COMPANY_NAME = "Test Demo";
const EMAIL_DOMAIN = "testdemo.example";
const PASSWORD = process.env.DEMO_PASSWORD || "Demo#2026!";
const RESET = process.argv.includes("--reset");

type Id = { id: string };

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}
function daysAhead(n: number) {
  return new Date(Date.now() + n * 86_400_000);
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function strip(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
function log(message: string) {
  console.log(message);
}

// Runs one step of the build. A failure in one job or one nicety is reported and
// skipped so the rest of the demo still gets built.
async function step<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  ! ${label}: ${message.split("\n")[0].slice(0, 220)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reset: removes every row that belongs to the Test Demo company (and only it).
// ---------------------------------------------------------------------------
async function wipeCompany(companyId: string) {
  const memberships = await prisma.companyMembership.findMany({ where: { companyId }, select: { userId: true } });
  const userIds = memberships.map((m) => m.userId);

  // The stock ledger refuses deletes on purpose (reversals only). For this one
  // disposable company the guard is switched off for the length of a single
  // statement, scoped to this company's rows, and switched straight back on.
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "StockMovement" DISABLE TRIGGER "StockMovement_immutability_guard"');
    await prisma.$executeRawUnsafe('DELETE FROM "StockMovement" WHERE "companyId" = $1', companyId);
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "StockMovement" ENABLE TRIGGER "StockMovement_immutability_guard"');
  }

  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name::text AS table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'companyId' AND table_name <> 'Company'`;
  let remaining = tables.map((t) => t.table_name);
  // Tables reference each other (restrict), so keep sweeping until a full pass deletes everything.
  let stalled = 0;
  for (let pass = 0; pass < 60 && remaining.length > 0 && stalled < 4; pass += 1) {
    const failed: string[] = [];
    for (const table of remaining) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "companyId" = $1`, companyId);
      } catch {
        failed.push(table);
      }
    }
    stalled = failed.length === remaining.length ? stalled + 1 : 0;
    remaining = failed;
  }
  if (remaining.length > 0) throw new Error(`Could not clear: ${remaining.join(", ")}`);
  await prisma.company.delete({ where: { id: companyId } });

  // Demo logins that belong to no other company.
  for (const userId of userIds) {
    const other = await prisma.companyMembership.count({ where: { userId } });
    if (other === 0) await prisma.userIdentity.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Demo content
// ---------------------------------------------------------------------------
const MANUFACTURERS = [
  "Caterpillar", "Komatsu", "Volvo Construction Equipment", "Hitachi", "Cummins", "Bosch Rexroth", "Parker Hannifin", "Perkins",
];

const LOCATIONS: Array<{ code: string; name: string; type: "STORES" | "BIN" | "WORKSHOP" | "RECEIVING" | "PEX_HOLDING"; description?: string }> = [
  { code: "STORES", name: "Main Stores", type: "STORES", description: "Main parts store" },
  { code: "A1", name: "Bin A1 - Hydraulic seals", type: "BIN" },
  { code: "A2", name: "Bin A2 - Hydraulic components", type: "BIN" },
  { code: "A3", name: "Bin A3 - Drive train", type: "BIN" },
  { code: "B1", name: "Bin B1 - Engine consumables", type: "BIN" },
  { code: "B2", name: "Bin B2 - Engine components", type: "BIN" },
  { code: "B3", name: "Bin B3 - Engine internals", type: "BIN" },
  { code: "C1", name: "Bin C1 - Undercarriage", type: "BIN" },
  { code: "C2", name: "Bin C2 - Ground engaging tools", type: "BIN" },
  { code: "WS", name: "Workshop floor", type: "WORKSHOP" },
  { code: "RCV", name: "Receiving bay", type: "RECEIVING" },
  { code: "PEX", name: "PEX holding area", type: "PEX_HOLDING" },
];

const SUPPLIERS: Array<{ name: string; accountCode: string; email: string; phone: string; city: string; brands: string[]; contact: string }> = [
  { name: "Iron Range Spares", accountCode: "SUP-IRS", email: "orders@ironrange.example.com", phone: "011 555 0101", city: "Germiston", brands: ["Caterpillar", "Komatsu"], contact: "Daniel Pretorius" },
  { name: "Yellow Iron Components", accountCode: "SUP-YIC", email: "sales@yellowiron.example.com", phone: "011 555 0102", city: "Boksburg", brands: ["Komatsu", "Volvo Construction Equipment", "Hitachi"], contact: "Lerato Khumalo" },
  { name: "Highveld Hydraulics", accountCode: "SUP-HHY", email: "quotes@highveldhyd.example.com", phone: "011 555 0103", city: "Kempton Park", brands: ["Bosch Rexroth", "Parker Hannifin"], contact: "Andre Joubert" },
  { name: "Transvaal Engine Parts", accountCode: "SUP-TEP", email: "parts@transvaalengine.example.com", phone: "012 555 0104", city: "Pretoria", brands: ["Cummins", "Perkins", "Caterpillar"], contact: "Nomsa Zulu" },
  { name: "Cape Bearing & Seal", accountCode: "SUP-CBS", email: "info@capebearing.example.com", phone: "021 555 0105", city: "Cape Town", brands: [], contact: "Riaan van der Merwe" },
  { name: "Northern Machining Works", accountCode: "SUP-NMW", email: "workshop@northernmachining.example.com", phone: "015 555 0106", city: "Polokwane", brands: [], contact: "Frikkie Steyn" },
];

const CUSTOMERS: Array<{ name: string; code: string; city: string; province: string; contact: string; phone: string }> = [
  { name: "Karoo Quarries (Pty) Ltd", code: "CUS-KAR", city: "Beaufort West", province: "Western Cape", contact: "Hennie Louw", phone: "023 555 0201" },
  { name: "Bushveld Earthmoving", code: "CUS-BUS", city: "Mokopane", province: "Limpopo", contact: "Thandi Mabasa", phone: "015 555 0202" },
  { name: "Sunrise Civils", code: "CUS-SUN", city: "Durban", province: "KwaZulu-Natal", contact: "Rajesh Pillay", phone: "031 555 0203" },
  { name: "Eastern Cape Plant Hire", code: "CUS-ECP", city: "Gqeberha", province: "Eastern Cape", contact: "Mandla Nkosi", phone: "041 555 0204" },
  { name: "Northern Aggregate Mining", code: "CUS-NAM", city: "Rustenburg", province: "North West", contact: "Elsa Kruger", phone: "014 555 0205" },
  { name: "Drakensberg Logistics", code: "CUS-DRK", city: "Ladysmith", province: "KwaZulu-Natal", contact: "Sibusiso Dube", phone: "036 555 0206" },
  { name: "Coastline Construction", code: "CUS-CST", city: "East London", province: "Eastern Cape", contact: "Karen Botha", phone: "043 555 0207" },
  { name: "Platinum Ridge Mining", code: "CUS-PLR", city: "Steelpoort", province: "Limpopo", contact: "Johan Swanepoel", phone: "013 555 0208" },
];

const MECHANICS = ["Mike Mechanic", "Thabo Mokoena", "Pieter Venter", "Sipho Dlamini"];
const SALES_REPS = ["Sam Sales", "Priya Naidoo", "Johan Botha"];

type PartSeed = { pn: string; desc: string; mfr: string | null; cost: number; price: number; bin: string; stock: number; min?: number; cat: string };
const PARTS: PartSeed[] = [
  { pn: "HP-A8V107", desc: "Axial piston pump rebuild kit, 107cc", mfr: "Bosch Rexroth", cost: 14500, price: 21750, bin: "A1", stock: 3, min: 1, cat: "Hydraulics" },
  { pn: "HP-SK349", desc: "Hydraulic cylinder seal kit, boom", mfr: "Caterpillar", cost: 2150, price: 3225, bin: "A1", stock: 4, min: 2, cat: "Hydraulics" },
  { pn: "HP-SK300", desc: "Hydraulic cylinder seal kit, stick", mfr: "Komatsu", cost: 1980, price: 2970, bin: "A1", stock: 6, min: 2, cat: "Hydraulics" },
  { pn: "HP-VALVE-MC", desc: "Main control valve relief valve", mfr: "Bosch Rexroth", cost: 3600, price: 5400, bin: "A2", stock: 2, min: 1, cat: "Hydraulics" },
  { pn: "HP-HOSE-1", desc: "Hydraulic hose assembly 1 inch x 1.2m", mfr: "Parker Hannifin", cost: 780, price: 1170, bin: "A2", stock: 12, min: 4, cat: "Hydraulics" },
  { pn: "HP-FIT-JIC", desc: "JIC fitting kit, 250 piece", mfr: "Parker Hannifin", cost: 950, price: 1425, bin: "A2", stock: 5, min: 2, cat: "Hydraulics" },
  { pn: "HP-FILT-HY", desc: "Hydraulic return filter element", mfr: "Caterpillar", cost: 420, price: 630, bin: "B1", stock: 18, min: 6, cat: "Filters" },
  { pn: "HP-GEAR-P", desc: "Gear pump 63cc", mfr: "Parker Hannifin", cost: 5200, price: 7800, bin: "A2", stock: 1, min: 2, cat: "Hydraulics" },
  { pn: "HP-CYL-ROD", desc: "Hydraulic cylinder rod, hard chrome", mfr: "Hitachi", cost: 7800, price: 11700, bin: "C1", stock: 0, min: 1, cat: "Hydraulics" },
  { pn: "EN-INJ-QSK", desc: "Fuel injector, QSK series", mfr: "Cummins", cost: 9800, price: 14700, bin: "B1", stock: 6, min: 2, cat: "Engine" },
  { pn: "EN-TURBO-3406", desc: "Turbocharger, 3406 engine", mfr: "Caterpillar", cost: 22800, price: 34200, bin: "B2", stock: 1, min: 1, cat: "Engine" },
  { pn: "EN-GASKET-SET", desc: "Head gasket set", mfr: "Perkins", cost: 3150, price: 4725, bin: "B1", stock: 4, min: 2, cat: "Engine" },
  { pn: "EN-OIL-FILT", desc: "Engine oil filter", mfr: "Cummins", cost: 180, price: 270, bin: "B1", stock: 40, min: 12, cat: "Filters" },
  { pn: "EN-FUEL-FILT", desc: "Fuel filter", mfr: "Cummins", cost: 210, price: 315, bin: "B1", stock: 35, min: 12, cat: "Filters" },
  { pn: "EN-WP-6BT", desc: "Water pump, 6BT", mfr: "Cummins", cost: 2900, price: 4350, bin: "B2", stock: 2, min: 1, cat: "Engine" },
  { pn: "EN-STARTER-24", desc: "Starter motor 24V", mfr: "Caterpillar", cost: 7400, price: 11100, bin: "B2", stock: 0, min: 1, cat: "Electrical" },
  { pn: "EN-ALT-24V", desc: "Alternator 24V 80A", mfr: "Perkins", cost: 3300, price: 4950, bin: "B2", stock: 2, min: 1, cat: "Electrical" },
  { pn: "EN-PISTON-KIT", desc: "Piston and liner kit", mfr: "Perkins", cost: 8600, price: 12900, bin: "B3", stock: 3, min: 1, cat: "Engine" },
  { pn: "EN-CONROD-BRG", desc: "Conrod bearing set", mfr: "Cummins", cost: 1450, price: 2175, bin: "B3", stock: 8, min: 3, cat: "Engine" },
  { pn: "UC-ROLLER-T", desc: "Track roller, single flange", mfr: "Komatsu", cost: 3900, price: 5850, bin: "C1", stock: 8, min: 4, cat: "Undercarriage" },
  { pn: "UC-IDLER", desc: "Front idler assembly", mfr: "Komatsu", cost: 11800, price: 17700, bin: "C1", stock: 2, min: 1, cat: "Undercarriage" },
  { pn: "UC-LINK-SET", desc: "Track chain link set, 45 links", mfr: "Hitachi", cost: 26500, price: 39750, bin: "C2", stock: 1, min: 1, cat: "Undercarriage" },
  { pn: "UC-SPROCKET", desc: "Drive sprocket segment", mfr: "Hitachi", cost: 2800, price: 4200, bin: "C1", stock: 6, min: 2, cat: "Undercarriage" },
  { pn: "UC-BUCKET-PIN", desc: "Bucket pin 70mm", mfr: "Caterpillar", cost: 1250, price: 1875, bin: "C2", stock: 10, min: 4, cat: "Ground engaging" },
  { pn: "UC-BUSH-KIT", desc: "Pin bush kit", mfr: "Volvo Construction Equipment", cost: 980, price: 1470, bin: "C2", stock: 14, min: 4, cat: "Ground engaging" },
  { pn: "UC-TOOTH", desc: "Bucket tooth", mfr: "Caterpillar", cost: 520, price: 780, bin: "C2", stock: 30, min: 10, cat: "Ground engaging" },
  { pn: "DT-FD-PC300", desc: "Final drive seal kit", mfr: "Komatsu", cost: 1700, price: 2550, bin: "A3", stock: 5, min: 2, cat: "Drive train" },
  { pn: "DT-SWING-MTR", desc: "Swing motor rebuild kit", mfr: "Volvo Construction Equipment", cost: 6200, price: 9300, bin: "A3", stock: 2, min: 1, cat: "Drive train" },
  { pn: "DT-TRANS-966", desc: "Transmission clutch pack", mfr: "Caterpillar", cost: 18400, price: 27600, bin: "A3", stock: 1, min: 1, cat: "Drive train" },
  { pn: "DT-CLUTCH-DISC", desc: "Clutch plate", mfr: "Caterpillar", cost: 1900, price: 2850, bin: "A3", stock: 6, min: 2, cat: "Drive train" },
  { pn: "DT-BRG-6316", desc: "Deep groove ball bearing 6316", mfr: null, cost: 360, price: 540, bin: "A3", stock: 20, min: 6, cat: "Bearings" },
  { pn: "DT-BRG-22220", desc: "Spherical roller bearing 22220", mfr: null, cost: 1250, price: 1875, bin: "A3", stock: 6, min: 2, cat: "Bearings" },
  { pn: "DT-OILSEAL-90", desc: "Oil seal 90 x 120 x 12", mfr: null, cost: 95, price: 143, bin: "A3", stock: 50, min: 15, cat: "Seals" },
  { pn: "EL-SENSOR-PRS", desc: "Pressure sensor 0-400 bar", mfr: "Bosch Rexroth", cost: 1650, price: 2475, bin: "A2", stock: 4, min: 2, cat: "Electrical" },
  { pn: "EL-HARNESS-EC", desc: "Engine wiring harness", mfr: "Volvo Construction Equipment", cost: 5400, price: 8100, bin: "B3", stock: 1, min: 1, cat: "Electrical" },
  { pn: "MS-GASKET-SIL", desc: "Gasket maker, 300ml", mfr: null, cost: 120, price: 180, bin: "B1", stock: 24, min: 8, cat: "Consumables" },
  { pn: "MS-GREASE-CART", desc: "Grease cartridges, box of 10", mfr: null, cost: 380, price: 570, bin: "B1", stock: 15, min: 5, cat: "Consumables" },
  { pn: "MS-STUD-KIT", desc: "Stud and nut kit", mfr: "Hitachi", cost: 640, price: 960, bin: "C2", stock: 9, min: 3, cat: "Hardware" },
];

type JobSeed = {
  key: string;
  type: "STANDARD_REPAIR" | "PARTIAL_REPAIR" | "PEX_SUPPLY" | "OUTRIGHT_SALE" | "FIELD_SERVICE" | "WARRANTY";
  customer: string;
  make?: string;
  model?: string;
  serial?: string;
  component?: string;
  description: string;
  notes?: string;
  status: string | null;
  receivedDaysAgo?: number;
  etaInDays?: number;
  po?: string;
  parts?: Array<[string, number]>;
  mechanic?: string;
  rep?: string;
};

const JOBS: JobSeed[] = [
  { key: "pump", type: "STANDARD_REPAIR", customer: "Karoo Quarries (Pty) Ltd", make: "Caterpillar", model: "349F", serial: "CAT0349FJ7K00412", component: "Main hydraulic pump", description: "Main hydraulic pump has lost pressure under load. Strip, inspect and rebuild with new kit and bearings.", notes: "Customer reports the machine slows down when digging and swinging together. Pump to be pressure tested after the rebuild.", status: "STRIPPING", receivedDaysAgo: 9, etaInDays: 6, po: "KQ-45811", parts: [["HP-A8V107", 1], ["HP-SK349", 3], ["DT-BRG-22220", 2], ["DT-OILSEAL-90", 4]], mechanic: "Mike Mechanic", rep: "Sam Sales" },
  { key: "undercarriage", type: "STANDARD_REPAIR", customer: "Bushveld Earthmoving", make: "Komatsu", model: "PC300LC-8", serial: "KMT-PC300-88231", component: "Undercarriage", description: "Full undercarriage rebuild: rollers, idlers and sprockets. Quote required before work starts.", status: "QUOTE_IN_PROGRESS", receivedDaysAgo: 5, etaInDays: 12, po: "BE-2210", parts: [["UC-ROLLER-T", 10], ["UC-IDLER", 2], ["UC-LINK-SET", 2], ["UC-SPROCKET", 2]], mechanic: "Thabo Mokoena", rep: "Priya Naidoo" },
  { key: "swing", type: "STANDARD_REPAIR", customer: "Sunrise Civils", make: "Volvo Construction Equipment", model: "EC210B", serial: "VCE-EC210-30458", component: "Swing motor", description: "Swing motor leaking from the shaft seal and noisy on start-up. Quote sent, waiting for customer go-ahead.", status: "AWAITING_GO_AHEAD", receivedDaysAgo: 7, etaInDays: 10, parts: [["DT-SWING-MTR", 1], ["DT-BRG-6316", 2], ["DT-OILSEAL-90", 2]], mechanic: "Pieter Venter", rep: "Johan Botha" },
  { key: "injectors", type: "PARTIAL_REPAIR", customer: "Platinum Ridge Mining", make: "Cummins", model: "QSK19", serial: "CUM-QSK19-5521", component: "Engine top end", description: "Replace injectors and recondition cylinder head. Head sent out for machining.", notes: "Matching seal kit also being fitted to the boom cylinder while the machine is in.", status: "ASSEMBLY", receivedDaysAgo: 12, etaInDays: 3, po: "PRM-9904", parts: [["EN-INJ-QSK", 6], ["EN-GASKET-SET", 1], ["HP-SK349", 3], ["EN-OIL-FILT", 2]], mechanic: "Sipho Dlamini", rep: "Sam Sales" },
  { key: "cylinder", type: "STANDARD_REPAIR", customer: "Eastern Cape Plant Hire", make: "Hitachi", model: "ZX350LC-5", serial: "HIT-ZX350-77102", component: "Stick cylinder", description: "Stick cylinder rod scored. Re-chrome the rod, reseal and pressure test.", status: "TESTING", receivedDaysAgo: 14, etaInDays: 1, parts: [["HP-SK300", 1], ["HP-CYL-ROD", 1], ["MS-GREASE-CART", 1]], mechanic: "Mike Mechanic", rep: "Priya Naidoo" },
  { key: "transmission", type: "STANDARD_REPAIR", customer: "Northern Aggregate Mining", make: "Caterpillar", model: "966H", serial: "CAT0966HK5J01877", component: "Transmission", description: "Transmission slipping in 3rd gear. Replaced clutch pack and discs, tested and ready for delivery.", status: "TO_BE_DELIVERED", receivedDaysAgo: 18, etaInDays: 0, po: "NAM-7730", parts: [["DT-TRANS-966", 1], ["DT-CLUTCH-DISC", 4], ["DT-OILSEAL-90", 3]], mechanic: "Thabo Mokoena", rep: "Sam Sales" },
  { key: "turbo", type: "STANDARD_REPAIR", customer: "Coastline Construction", make: "Caterpillar", model: "D6R", serial: "CAT00D6RK2H00339", component: "Turbocharger", description: "Turbocharger replaced and engine run tested. Delivered, invoice outstanding.", status: "DELIVERED_AWAITING_PAYMENT", receivedDaysAgo: 22, parts: [["EN-TURBO-3406", 1], ["EN-GASKET-SET", 1]], mechanic: "Pieter Venter", rep: "Johan Botha" },
  { key: "done", type: "STANDARD_REPAIR", customer: "Drakensberg Logistics", make: "Volvo Construction Equipment", model: "A40E", serial: "VCE-A40E-12044", component: "Axle seals", description: "Rear axle seals and bushes replaced.", status: "COMPLETE", receivedDaysAgo: 35, parts: [["UC-BUSH-KIT", 4], ["DT-OILSEAL-90", 6]], mechanic: "Sipho Dlamini", rep: "Sam Sales" },
  { key: "closed", type: "STANDARD_REPAIR", customer: "Karoo Quarries (Pty) Ltd", make: "Caterpillar", model: "772G", serial: "CAT0772GJ4F00911", component: "Bucket and teeth", description: "Bucket pins and bushes replaced, new teeth fitted.", status: "CLOSED", receivedDaysAgo: 48, parts: [["UC-BUCKET-PIN", 4], ["UC-TOOTH", 8]], mechanic: "Mike Mechanic", rep: "Priya Naidoo" },
  { key: "incoming", type: "STANDARD_REPAIR", customer: "Bushveld Earthmoving", make: "Komatsu", model: "WA470-6", serial: "KMT-WA470-20917", component: "Final drive", description: "Final drive to be collected from site for inspection and reseal.", status: "TO_BE_COLLECTED", etaInDays: 2, parts: [["DT-FD-PC300", 1]], rep: "Johan Botha" },
  { key: "waitingparts", type: "STANDARD_REPAIR", customer: "Sunrise Civils", make: "Hitachi", model: "ZX200-5", serial: "HIT-ZX200-44018", component: "Starter and alternator", description: "No-start condition. New starter ordered; alternator tested and replaced.", status: "ASSEMBLY", receivedDaysAgo: 6, etaInDays: 4, parts: [["EN-STARTER-24", 1], ["EN-ALT-24V", 1]], mechanic: "Pieter Venter", rep: "Sam Sales" },
  { key: "pexsupply", type: "PEX_SUPPLY", customer: "Karoo Quarries (Pty) Ltd", make: "Caterpillar", model: "3406E", serial: "CAT-3406E-8FF", component: "3406E engine (PEX exchange)", description: "Supply an exchange 3406E engine. Customer's old engine to come back as the core.", status: "TO_BE_DELIVERED", receivedDaysAgo: 3, etaInDays: 1, po: "KQ-45902", rep: "Priya Naidoo" },
  { key: "field1", type: "FIELD_SERVICE", customer: "Sunrise Civils", make: "Volvo Construction Equipment", model: "L120H", serial: "VCE-L120H-70115", component: "Loader - hydraulic fault", description: "Breakdown on site: loader loses lift power when warm.", status: "IN_PROGRESS", receivedDaysAgo: 1, etaInDays: 1, parts: [["HP-HOSE-1", 2], ["EL-SENSOR-PRS", 1]], mechanic: "Thabo Mokoena", rep: "Johan Botha" },
  { key: "field2", type: "FIELD_SERVICE", customer: "Eastern Cape Plant Hire", make: "Komatsu", model: "D65PX-16", serial: "KMT-D65-31288", component: "Dozer - service", description: "2000 hour service and track tension adjustment on site.", status: "AWAIT_PAYMENT", receivedDaysAgo: 8, parts: [["EN-OIL-FILT", 2], ["EN-FUEL-FILT", 2], ["MS-GREASE-CART", 1]], mechanic: "Mike Mechanic", rep: "Priya Naidoo" },
  { key: "warranty", type: "WARRANTY", customer: "Coastline Construction", make: "Hitachi", model: "ZX250LC-6", serial: "HIT-ZX250-90177", component: "Swing bearing", description: "Swing bearing failed within the warranty period. Claim lodged with the supplier.", status: "AWAITING_GO_AHEAD", receivedDaysAgo: 10, etaInDays: 14, parts: [["DT-BRG-22220", 1], ["MS-STUD-KIT", 1]], mechanic: "Sipho Dlamini", rep: "Sam Sales" },
  { key: "sale", type: "OUTRIGHT_SALE", customer: "Platinum Ridge Mining", description: "Parts supply: filters and consumables for the site workshop.", status: "TO_BE_DELIVERED", receivedDaysAgo: 2, etaInDays: 1, po: "PRM-9951", parts: [["EN-OIL-FILT", 10], ["EN-FUEL-FILT", 10], ["HP-FILT-HY", 6], ["MS-GASKET-SIL", 6]], rep: "Johan Botha" },
  { key: "enquiry", type: "STANDARD_REPAIR", customer: "Northern Aggregate Mining", make: "Komatsu", model: "HD465-7", component: "Brake pack", description: "Enquiry for a wet brake pack rebuild. Machine details still to be confirmed.", status: "TO_BE_COLLECTED", rep: "Sam Sales" },
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const existing = await prisma.company.findUnique({ where: { internalCode: COMPANY_CODE } });
  if (existing) {
    if (existing.internalCode === BLACK_ROCK_INTERNAL_CODE) throw new Error("Refusing to touch the Black Rock company.");
    if (!RESET) {
      console.log(`"${COMPANY_NAME}" already exists. Run again with --reset to wipe it and rebuild the demo data.`);
      return;
    }
    log(`Resetting "${COMPANY_NAME}"...`);
    await wipeCompany(existing.id);
  }

  // --- Company, modules, numbering ------------------------------------------------
  log("Creating the company...");
  const company = await prisma.company.create({
    data: {
      internalCode: COMPANY_CODE,
      legalName: COMPANY_NAME,
      tradingName: "Test Demo Workshop",
      defaultCurrencyCode: "ZAR",
      defaultGracePeriodDays: 30,
      settings: {
        create: {
          themeColor: "#0f766e",
          mainTelephone: "011 555 0100",
          mainEmail: `info@${EMAIL_DOMAIN}`,
          website: "www.testdemo.example",
          registrationNumber: "2020/123456/07",
          vatNumber: "4123456789",
          quoteValidityDays: 30,
          defaultTaxJurisdiction: "ZA",
        },
      },
    },
  });
  const companyId = company.id;
  const effectiveFrom = new Date();
  const modules = Object.values(ModuleKey);
  await prisma.companyModuleEntitlement.createMany({
    data: modules.map((module) => ({ companyId, product: "WORKSHOP" as const, module, status: "ACTIVE" as const, source: "PLATFORM_OVERRIDE" as const, effectiveFrom, expiresAt: null, gracePeriodDays: null })),
  });
  await prisma.entitlementHistory.createMany({
    data: modules.map((module) => ({ companyId, product: "WORKSHOP" as const, module, previousStatus: null, newStatus: "ACTIVE" as const, source: "PLATFORM_OVERRIDE" as const, effectiveAt: effectiveFrom, expiresAt: null, reason: "Demo company: all modules enabled", changedById: null })),
  }).catch(() => undefined);
  const sequences: Array<[string, string, number]> = [
    ["JOB", "DEMO", 4], ["PEX_JOB", "DPEX", 4], ["QUOTE", "DQ", 4], ["SALES_ORDER", "DSO", 4], ["INVOICE", "DINV", 4], ["PAYMENT_RECEIPT", "DPR", 4], ["PROCUREMENT_RFQ", "DRFQ", 4],
  ];
  await prisma.documentNumberSequence.createMany({
    data: sequences.map(([type, prefix, padding]) => ({ companyId, type: type as never, prefix, padding, nextValue: BigInt(1), active: true })),
  });

  // --- Users ----------------------------------------------------------------------
  log("Creating demo logins...");
  const passwordHash = await hashPassword(PASSWORD);
  const USERS: Array<{ email: string; name: string; role: TenantRole; label: string }> = [
    { email: `admin@${EMAIL_DOMAIN}`, name: "Demo Admin", role: "COMPANY_ADMIN", label: "Company admin (sees everything, settings and users)" },
    { email: `manager@${EMAIL_DOMAIN}`, name: "Maria Manager", role: "MANAGER", label: "Manager" },
    { email: `sales@${EMAIL_DOMAIN}`, name: "Sam Sales", role: "SALES", label: "Sales" },
    { email: `stores@${EMAIL_DOMAIN}`, name: "Stella Stores", role: "STORE_CONTROLLER", label: "Store controller" },
    { email: `finance@${EMAIL_DOMAIN}`, name: "Fiona Finance", role: "FINANCE", label: "Finance" },
    { email: `mechanic@${EMAIL_DOMAIN}`, name: "Mike Mechanic", role: "USER", label: "Mechanic (can only edit notes, parts and outwork on a job)" },
  ];
  let adminId = "";
  for (const u of USERS) {
    const user = await prisma.userIdentity.upsert({
      where: { email: u.email },
      create: { email: u.email, displayName: u.name, passwordHash, active: true },
      update: { displayName: u.name, passwordHash, active: true, sessionVersion: { increment: 1 } },
    });
    await prisma.companyMembership.create({ data: { userId: user.id, companyId, role: u.role } });
    if (u.role === "COMPANY_ADMIN") adminId = user.id;
  }

  const ctx: RequestContext = {
    userId: adminId,
    displayName: "Demo Admin",
    companyId,
    companyInternalCode: COMPANY_CODE,
    companyName: COMPANY_NAME,
    tenantRole: "COMPANY_ADMIN",
    tenantPermissions: new Set(TENANT_PERMISSIONS),
    platformPermissions: new Set(),
    supportAccessId: null,
    supportMode: null,
    moduleAccess: new Map(modules.map((m) => [m, "FULL" as const])),
    correlationId: "demo-seed",
  };

  // --- Staff ----------------------------------------------------------------------
  log("Adding mechanics and sales representatives...");
  const mechanicIds = new Map<string, string>();
  for (const name of MECHANICS) {
    const row = await step(`mechanic ${name}`, () => createMechanic(ctx, { name }));
    if (row) mechanicIds.set(name, row.id);
  }
  const repIds = new Map<string, string>();
  for (const name of SALES_REPS) {
    const row = await step(`sales rep ${name}`, () => createSalesRepresentative(ctx, { name }));
    if (row) repIds.set(name, row.id);
  }

  // --- Master data ------------------------------------------------------------------
  log("Adding manufacturers and storage locations...");
  const manufacturerIds = new Map<string, string>();
  for (const name of MANUFACTURERS) {
    const row = await step(`manufacturer ${name}`, async () => (await createMaster(ctx, "manufacturers", { name })) as Id);
    if (row) manufacturerIds.set(name, row.id);
  }
  const locationIds = new Map<string, string>();
  for (const loc of LOCATIONS) {
    const row = await step(`location ${loc.code}`, async () => (await createMaster(ctx, "storage-locations", loc)) as Id);
    if (row) locationIds.set(loc.code, row.id);
  }

  log("Adding suppliers and customers...");
  const supplierIds = new Map<string, string>();
  for (const s of SUPPLIERS) {
    const row = await step(`supplier ${s.name}`, async () =>
      (await createMaster(ctx, "suppliers", {
        name: s.name,
        accountCode: s.accountCode,
        mainEmail: s.email,
        mainTelephone: s.phone,
        manufacturerIds: s.brands.map((b) => manufacturerIds.get(b)).filter((x): x is string => Boolean(x)),
        address: { type: "PHYSICAL", line1: `${10 + SUPPLIERS.indexOf(s) * 7} Industrial Road`, city: s.city, province: "", postalCode: "1400", countryCode: "ZA" },
        contacts: [{ firstName: s.contact.split(" ")[0], lastName: s.contact.split(" ").slice(1).join(" ") || null, email: s.email, telephone: s.phone, isPrimary: true, canReceiveRfq: true }],
      })) as Id,
    );
    if (row) supplierIds.set(s.name, row.id);
  }
  const customerIds = new Map<string, string>();
  for (const c of CUSTOMERS) {
    const row = await step(`customer ${c.name}`, async () =>
      (await createMaster(ctx, "customers", {
        name: c.name,
        accountCode: c.code,
        mainTelephone: c.phone,
        mainEmail: `accounts@${c.code.toLowerCase()}.example.com`,
        currencyCode: "ZAR",
        address: { type: "BILLING", line1: `${20 + CUSTOMERS.indexOf(c) * 11} Main Street`, city: c.city, province: c.province, postalCode: "0001", countryCode: "ZA" },
        contacts: [{ firstName: c.contact.split(" ")[0], lastName: c.contact.split(" ").slice(1).join(" ") || null, email: `${c.contact.split(" ")[0].toLowerCase()}@${c.code.toLowerCase()}.example.com`, telephone: c.phone, isPrimary: true }],
      })) as Id,
    );
    if (row) customerIds.set(c.name, row.id);
  }

  // --- Parts and stock --------------------------------------------------------------
  log("Adding the parts catalogue and stock...");
  const partIds = new Map<string, string>();
  const stockLocation = locationIds.get("STORES");
  for (const p of PARTS) {
    const row = await step(`part ${p.pn}`, async () =>
      (await createMaster(ctx, "parts", {
        partNumber: p.pn,
        description: p.desc,
        manufacturerId: p.mfr ? manufacturerIds.get(p.mfr) ?? null : null,
        category: p.cat,
        unitOfMeasure: "EA",
        defaultPurchaseCost: p.cost,
        defaultSellingPrice: p.price,
        binLocationId: locationIds.get(p.bin) ?? null,
        reorderMinimum: p.min ?? null,
      })) as Id,
    );
    if (!row) continue;
    partIds.set(p.pn, row.id);
    const locationId = locationIds.get(p.bin) ?? stockLocation;
    if (p.stock > 0 && locationId) {
      await step(`stock ${p.pn}`, () =>
        receiveStock(ctx, { partId: row.id, locationId, quantity: String(p.stock), unitCost: p.cost, supplierId: null, supplierDeliveryNote: null, referenceNumber: "Opening stock", notes: "Demo opening stock" } as never),
      );
    }
  }

  // --- Jobs ---------------------------------------------------------------------------
  log("Creating jobs...");
  const jobIds = new Map<string, string>();
  for (const j of JOBS) {
    const customerId = customerIds.get(j.customer);
    if (!customerId) continue;
    const created = await step(`job ${j.key}`, async () => {
      const draft = (await createJob(ctx, {
        customerId,
        type: j.type,
        machineMake: j.make ?? null,
        machineModel: j.model ?? null,
        machineSerial: j.serial ?? null,
        component: j.component ?? null,
        description: j.description,
        notes: j.notes ?? null,
        customerPo: j.po ?? null,
        dateReceived: j.receivedDaysAgo != null ? isoDate(daysAgo(j.receivedDaysAgo)) : null,
        etaDate: j.etaInDays != null ? isoDate(daysAhead(j.etaInDays)) : null,
        stripMechanicId: j.mechanic ? mechanicIds.get(j.mechanic) ?? null : null,
        buildMechanicId: j.mechanic ? mechanicIds.get(j.mechanic) ?? null : null,
        salesRepresentativeId: j.rep ? repIds.get(j.rep) ?? null : null,
        ...(j.type === "FIELD_SERVICE" ? { siteContactName: "Site foreman", siteContactPhone: "082 555 0199", siteAddress: "Site 4, N2 road works", accessNotes: "Report to the site office at the gate first." } : {}),
      })) as Id;
      return draft;
    });
    if (!created) continue;
    jobIds.set(j.key, created.id);
    if (j.status === null) continue;
    // Jobs are created at the first stage of their flow; step forward from there.
    const firstStage = j.type === "FIELD_SERVICE" ? "TO_ATTEND" : "TO_BE_COLLECTED";
    const final = j.status === "CLOSED" ? "COMPLETE" : j.status;
    if (final !== firstStage) await step(`status ${j.key}`, () => changeJobStatus(ctx, created.id, { status: final }));
    if (j.receivedDaysAgo != null) {
      await prisma.job.update({ where: { id: created.id }, data: { createdAt: daysAgo(j.receivedDaysAgo + 1) } }).catch(() => undefined);
    }
  }

  // --- Parts lists ---------------------------------------------------------------------
  log("Adding parts lists...");
  for (const j of JOBS) {
    const jobId = jobIds.get(j.key);
    if (!jobId || !j.parts?.length) continue;
    await step(`parts ${j.key}`, () => addPartLinesBulk(ctx, jobId, { bulkLines: j.parts!.map(([pn, qty]) => `${pn}, ${qty}`).join("\n") }));
  }

  const lineFor = async (jobKey: string, pn: string) => {
    const jobId = jobIds.get(jobKey);
    const partId = partIds.get(pn);
    if (!jobId || !partId) return null;
    return prisma.jobPartLine.findFirst({ where: { jobId, partId, companyId } });
  };

  // Ordered-from-supplier example: the starter motor is out of stock.
  await step("order starter", async () => {
    const line = await lineFor("waitingparts", "EN-STARTER-24");
    const supplierId = supplierIds.get("Iron Range Spares");
    if (!line || !supplierId) return;
    await updatePartLineOrder(ctx, jobIds.get("waitingparts")!, line.id, { orderNumber: "PO-DEMO-1042", orderedFromSupplierId: supplierId, orderedQuantity: 1 });
  });

  // Completed jobs: parts received.
  for (const key of ["turbo", "done", "closed", "transmission", "field2"]) {
    const jobId = jobIds.get(key);
    if (!jobId) continue;
    const lines = await prisma.jobPartLine.findMany({ where: { jobId, companyId } });
    for (const line of lines) {
      await step(`receive ${key} ${line.partNumber}`, () => markPartLineReceived(ctx, jobId, line.id, { receivedQty: Number(line.quantity) }));
    }
  }
  if (jobIds.get("closed")) await step("close job", () => closeJob(ctx, jobIds.get("closed")!, { outcome: "Completed", closingNote: "Repaired, delivered and invoiced. Customer signed off." }));

  // --- RFQ with saved quotes (undercarriage job) ----------------------------------------
  log("Adding the quote request example...");
  await step("rfq", async () => {
    const jobId = jobIds.get("undercarriage");
    if (!jobId) return;
    const lines = await prisma.jobPartLine.findMany({ where: { jobId, companyId }, orderBy: { createdAt: "asc" } });
    const quotes: Array<{ supplier: string; factor: number; unavailable?: string[] }> = [
      { supplier: "Iron Range Spares", factor: 0.97 },
      { supplier: "Yellow Iron Components", factor: 0.91, unavailable: ["UC-LINK-SET"] },
    ];
    const quoteIds: Array<{ supplier: string; quoteId: string }> = [];
    for (const q of quotes) {
      const supplierId = supplierIds.get(q.supplier);
      if (!supplierId) continue;
      const rfq = (await requestRfqFromSupplier(ctx, jobId, { supplierId, sendEmail: false })) as Id;
      await recordRfqQuote(ctx, jobId, rfq.id, { notes: "Quote received by phone and email." });
      await saveRfqQuoteLines(ctx, jobId, rfq.id, {
        lines: lines.map((line) => {
          const part = PARTS.find((p) => strip(p.pn) === strip(line.partNumber));
          const unavailable = part ? q.unavailable?.includes(part.pn) : false;
          return { partLineId: line.id, unitPrice: unavailable || !part ? null : Math.round(part.cost * q.factor), available: !unavailable };
        }),
      });
      const quote = await prisma.jobRfqQuote.findFirst({ where: { rfqRequestId: rfq.id } });
      if (quote) quoteIds.push({ supplier: q.supplier, quoteId: quote.id });
    }
    // Mark the cheapest quote on the idler as the preferred one.
    const idler = lines.find((l) => strip(l.partNumber) === "UCIDLER");
    const choice = quoteIds.find((q) => q.supplier === "Yellow Iron Components");
    if (idler && choice) await step("preferred quote", () => setPreferredQuoteLine(ctx, jobId, { partLineId: idler.id, rfqQuoteId: choice.quoteId }));
  });

  // --- Outwork on the injectors job ------------------------------------------------------
  await step("outwork", async () => {
    const jobId = jobIds.get("injectors");
    const supplierId = supplierIds.get("Northern Machining Works");
    if (!jobId || !supplierId) return;
    await addOutworkItems(ctx, jobId, { supplierId, dateSentOut: isoDate(daysAgo(6)), lines: [{ description: "Cylinder head: pressure test, skim and valve seat recut", quantity: 1 }, { description: "Injector sleeves: hone to size", quantity: 6 }] });
  });

  // --- Field service report and warranty claim ---------------------------------------------
  await step("field report", async () => {
    const jobId = jobIds.get("field1");
    if (!jobId) return;
    await upsertJobFieldService(ctx, jobId, {
      site: "Site 4, N2 road works",
      technician: "Thabo Mokoena",
      vehicle: "Service bakkie",
      scheduledDate: isoDate(daysAgo(1)),
      hoursNormal: 6,
      hoursOvertime: 1.5,
      hoursTravelled: 2,
      kmsTravelled: 184,
      findings: "Lift pressure drops when hydraulic oil is warm. Main relief valve is chattering and the return filter is partly blocked.",
      workDone: "Replaced the return filter and one hose. Pressure tested the circuit and checked the relief setting.",
      recommendations: "Replace the main relief valve at the next service. Monitor oil temperature.",
      followUpRequired: true,
      followUpDate: isoDate(daysAhead(7)),
    });
  });
  await step("warranty", async () => {
    const jobId = jobIds.get("warranty");
    if (!jobId) return;
    await upsertJobWarranty(ctx, jobId, { status: "PENDING", notes: "Claim submitted to the supplier with photos of the failed bearing. Awaiting their decision." });
  });

  // --- Picking slip -------------------------------------------------------------------------
  await step("picking slip", async () => {
    const jobId = jobIds.get("sale");
    if (jobId) await createPickSlipForJob(ctx, jobId);
  });

  // --- Summary ---------------------------------------------------------------------------------
  const counts = {
    customers: await prisma.customer.count({ where: { companyId } }),
    suppliers: await prisma.supplier.count({ where: { companyId } }),
    parts: await prisma.part.count({ where: { companyId } }),
    jobs: await prisma.job.count({ where: { companyId } }),
  };
  console.log("");
  console.log(`Test Demo is ready: ${counts.customers} customers, ${counts.suppliers} suppliers, ${counts.parts} parts, ${counts.jobs} jobs.`);
  console.log("");
  console.log("Logins (all use the same password):");
  for (const u of USERS) console.log(`  ${u.email.padEnd(32)} ${u.label}`);
  console.log(`Password: ${PASSWORD}`);
  console.log("");
  console.log("Demo tips: the 'Platinum Ridge' injector job and the 'Karoo Quarries' pump job both need the boom seal kit,");
  console.log("so Create picking slip on the injector job shows the reserved-parts window. The Bushveld undercarriage job");
  console.log("has two supplier quotes saved for Compare quotes, and the Komatsu make lists the Komatsu suppliers first.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
