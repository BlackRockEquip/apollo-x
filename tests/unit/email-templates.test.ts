import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  EMAIL_FIELD_GROUPS,
  EMAIL_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_GROUPS,
  EMAIL_TEMPLATE_KEYS,
  buildJobFieldValues,
  ccForSend,
  ccProblem,
  emailSampleValues,
  formatEmailDate,
  isDefaultWording,
  joinOrderNumbers,
  parseCcList,
  partsCountText,
  previewParts,
  storedCc,
  storedWording,
  templateFieldKeys,
  unknownFields,
} from "@/lib/email-template-fields";
import { buildFollowupEmailMessage, buildRfqEmailMessage, buildWipTableEmailMessage, renderTemplate, type CompanyEmailTemplates } from "@/lib/email-templates";
import { supplierContactFirstName } from "@/lib/email-template-vars";

const unset: CompanyEmailTemplates = { rfqSubject: null, rfqBody: null, followupSubject: null, followupBody: null, wipSubject: null, wipBody: null, signature: null };

describe("email template field catalogue", () => {
  it("lists every field once, each with a hint and an example value", () => {
    const keys = Object.values(EMAIL_FIELD_GROUPS).flatMap((g) => g.fields.map((f) => f.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const group of Object.values(EMAIL_FIELD_GROUPS)) for (const field of group.fields) {
      expect(field.hint.length, field.key).toBeGreaterThan(0);
      expect(field.sample.length, field.key).toBeGreaterThan(0);
    }
  });

  it("only offers groups that exist, and gives the signature just the company fields", () => {
    for (const key of EMAIL_TEMPLATE_KEYS) for (const group of EMAIL_TEMPLATE_GROUPS[key]) expect(EMAIL_FIELD_GROUPS[group], `${key}/${group}`).toBeDefined();
    expect(templateFieldKeys("signature").sort()).toEqual(["company", "companyPhone", "date", "senderName"]);
    expect(templateFieldKeys("wip")).toContain("filters");
    expect(templateFieldKeys("rfq")).toEqual(expect.arrayContaining(["machineSerial", "componentModel", "supplierOrderNumber", "supplierContact", "partsCount"]));
  });

  it("every default wording only uses fields its email can fill in, and renders without leftover tags", () => {
    const samples = emailSampleValues();
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const { subject, body } = EMAIL_TEMPLATE_DEFAULTS[key];
      expect(unknownFields(key, subject, body), key).toEqual([]);
      expect(renderTemplate(subject + body, samples), key).not.toContain("{{");
    }
  });
});

describe("unknownFields / previewParts", () => {
  it("flags fields the email cannot fill in (typos, or another email's fields), once each", () => {
    expect(unknownFields("wip", "{{title}} {{jobNumber}}", "{{ jobNumber }} {{coutn}}")).toEqual(["jobNumber", "coutn"]);
    expect(unknownFields("rfq", "{{machineSerial}} {{filters}}")).toEqual(["filters"]);
  });

  it("splits a template into text and filled fields for the preview", () => {
    expect(previewParts("Hi {{supplierName}}, job {{jobNumber}}.", { supplierName: "Acme", jobNumber: "J1" })).toEqual([
      { text: "Hi " }, { text: "Acme", field: "supplierName" }, { text: ", job " }, { text: "J1", field: "jobNumber" }, { text: "." },
    ]);
    expect(previewParts("{{missing}}", {})).toEqual([{ text: "", field: "missing" }]);
  });
});

describe("storedWording / isDefaultWording", () => {
  it("saves nothing for blank or default wording, and the text for anything else", () => {
    const d = EMAIL_TEMPLATE_DEFAULTS.rfq;
    expect(storedWording("rfq", "subject", "")).toBeNull();
    expect(storedWording("rfq", "subject", "   ")).toBeNull();
    expect(storedWording("rfq", "subject", d.subject)).toBeNull();
    expect(storedWording("rfq", "body", d.body.replace(/\n/g, "\r\n"))).toBeNull();
    expect(storedWording("rfq", "body", d.body + "\nThanks")).toBe(d.body + "\nThanks");
    expect(storedWording("signature", "body", "Thank you.")).toBeNull();
    expect(storedWording("signature", "body", "Kind regards\nWorkshop")).toBe("Kind regards\nWorkshop");
  });

  it("tells default from customised", () => {
    const d = EMAIL_TEMPLATE_DEFAULTS.wip;
    expect(isDefaultWording("wip", d.subject, d.body)).toBe(true);
    expect(isDefaultWording("wip", "", "")).toBe(true);
    expect(isDefaultWording("wip", d.subject, d.body + " ")).toBe(true);
    expect(isDefaultWording("wip", "My subject", d.body)).toBe(false);
  });
});

describe("sending: unchanged defaults, new fields", () => {
  it("an untouched company still sends the original wording", () => {
    const rfq = buildRfqEmailMessage(unset, { supplierName: "Acme", jobNumber: "J1", machine: "CAT 320", partsList: "P1 — Seal (qty 2)" });
    expect(rfq.subject).toBe("Request for quote — Job J1");
    expect(rfq.text).toBe("Hi Acme,\n\nCould you please quote on the following parts for job J1 (CAT 320)?\n\nP1 — Seal (qty 2)\n\nPlease reply with pricing and availability at your earliest convenience.\n\nThank you.");
    const follow = buildFollowupEmailMessage(unset, { supplierName: "Acme", jobNumber: "J1", partsList: "P1" });
    expect(follow.subject).toBe("Follow-up — outstanding parts for Job J1");
    expect(follow.text.endsWith("\n\nThank you.")).toBe(true);
  });

  it("a customised template can use the new fields", () => {
    const templates = { ...unset, followupBody: "Hi {{supplierContact}}, order {{supplierOrderNumber}}: {{partsCount}} for {{machineSerial}} / {{componentModel}}.\n{{partsList}}", signature: "{{senderName}}, {{company}} {{companyPhone}}" };
    const vars = { supplierContact: "Ruan", supplierOrderNumber: "PO-1, PO-2", partsCount: "2 parts", machineSerial: "S123", componentModel: "CH-1", partsList: "A\nB", senderName: "Mornay", company: "Hi-Gear", companyPhone: "011" };
    expect(buildFollowupEmailMessage(templates, vars).text).toBe("Hi Ruan, order PO-1, PO-2: 2 parts for S123 / CH-1.\nA\nB\n\nMornay, Hi-Gear 011");
  });

  it("the WIP email keeps its subject tidy and can use the sender fields", () => {
    const message = buildWipTableEmailMessage({ ...unset, wipBody: "From {{senderName}}\n\n\n\n{{filters}}" }, { title: "Jobs", company: "Hi-Gear", date: "2026/10/30", count: "2 jobs", filters: "All", senderName: "Mornay" }, "Note");
    expect(message.subject).toBe("Jobs - Hi-Gear - 2026/10/30");
    expect(message.text).toBe("From Mornay\n\nAll\n\nNote\n\nThank you.");
  });
});

describe("buildJobFieldValues", () => {
  const job = {
    jobNumber: "BRE1146", draftNumber: "d1", type: "STANDARD_REPAIR", status: "AWAIT_OUTWORK",
    customer: { name: "Black Rock" }, customerReference: " BR-1 ", customerPo: null,
    dateReceived: new Date("2026-10-13T08:00:00Z"), etaDate: null,
    salesRepresentative: { name: "Pieter" }, stripMechanic: null, buildMechanic: { name: "Andre" },
    machineMake: "Caterpillar", machineModel: "3406E", machineSerial: "7SK", plantNumber: "PL-1", machineHours: "12480.5000",
    component: "Cylinder head", componentModel: "CH-1", componentSerial: "CS-9", componentPartNumber: "4W0004", componentType: "Engine",
    quoteNumber: "Q1", salesOrderNumber: null, purchaseOrderNumber: "PO9", invoiceNumber: undefined,
  };

  it("fills every catalogue field that comes from a job", () => {
    const values = buildJobFieldValues(job);
    const jobFields = ["job", "machine", "component", "commercial"].flatMap((g) => EMAIL_FIELD_GROUPS[g as "job"].fields.map((f) => f.key));
    for (const key of jobFields) expect(values, key).toHaveProperty(key);
    expect(values).toMatchObject({
      jobNumber: "BRE1146", customerName: "Black Rock", customerReference: "BR-1", customerPo: "", dateIn: "13 Oct 2026", etaDate: "",
      salesRep: "Pieter", machinist: "Andre", machine: "Caterpillar 3406E", machineSerial: "7SK", machineHours: "12480.5",
      component: "Cylinder head", componentModel: "CH-1", salesOrderNumber: "", purchaseOrderNumber: "PO9", invoiceNumber: "",
    });
  });

  it("keeps the old wording for the machine, prefers the strip machinist, and falls back to the draft number", () => {
    const values = buildJobFieldValues({ ...job, jobNumber: null, machineMake: null, machineModel: null, stripMechanic: { name: "Sam" }, machineHours: "12480.0000" });
    expect(values.machine).toBe("the unit");
    expect(values.machinist).toBe("Sam");
    expect(values.jobNumber).toBe("d1");
    expect(values.machineHours).toBe("12480");
  });

  it("uses the Engineering wording for status and type", () => {
    const workshop = buildJobFieldValues(job);
    const engineering = buildJobFieldValues({ ...job, type: "WARRANTY", status: "QUOTE_IN_PROGRESS" }, "ENGINEERING");
    expect(workshop.jobStatus).toBe("Await outwork / parts");
    expect(engineering.jobType).toBe("Warranty repair");
  });
});

describe("small helpers", () => {
  it("formats dates, counts and order numbers", () => {
    expect(formatEmailDate("2026-10-30T10:00:00Z")).toBe("30 Oct 2026");
    expect(formatEmailDate(null)).toBe("");
    expect(formatEmailDate("not a date")).toBe("");
    expect(partsCountText(0)).toBe("");
    expect(partsCountText(1)).toBe("1 part");
    expect(partsCountText(3)).toBe("3 parts");
    expect(joinOrderNumbers([" PO-1 ", null, "PO-2", "PO-1", ""])).toBe("PO-1, PO-2");
    expect(joinOrderNumbers([])).toBe("");
  });

  it("picks the primary contact's first name, otherwise the first one", () => {
    expect(supplierContactFirstName([{ firstName: "Ann" }, { firstName: "Ruan", isPrimary: true }])).toBe("Ruan");
    expect(supplierContactFirstName([{ firstName: " " }, { firstName: "Ann" }])).toBe("Ann");
    expect(supplierContactFirstName([])).toBe("");
    expect(supplierContactFirstName(undefined)).toBe("");
  });
});

describe("CC addresses", () => {
  it("reads a list typed with commas, semicolons, spaces or lines, lower case and without repeats", () => {
    expect(parseCcList("Ann@x.co.za; bob@x.co.za,\nann@x.co.za  carol@y.com")).toEqual({ valid: ["ann@x.co.za", "bob@x.co.za", "carol@y.com"], invalid: [] });
    expect(parseCcList("")).toEqual({ valid: [], invalid: [] });
    expect(parseCcList(null)).toEqual({ valid: [], invalid: [] });
  });

  it("reports what is not an address", () => {
    expect(parseCcList("ann@x.co.za, bob, @x.com, c@d").invalid).toEqual(["bob", "@x.com", "c@d"]);
    expect(ccProblem("ann@x.co.za")).toBe("");
    expect(ccProblem("")).toBe("");
    expect(ccProblem("bob")).toBe("bob is not a valid email address.");
    expect(ccProblem("bob, ann")).toBe("bob, ann are not valid email addresses.");
    expect(ccProblem(Array.from({ length: 11 }, (_, i) => `a${i}@x.co.za`).join(","))).toBe("Copy at most 10 addresses.");
  });

  it("saves the tidy list, or nothing", () => {
    expect(storedCc(" Ann@X.co.za ;bob@x.co.za ")).toBe("ann@x.co.za, bob@x.co.za");
    expect(storedCc("  ")).toBeNull();
    expect(storedCc(null)).toBeNull();
  });

  it("does not copy someone who is already on the To line", () => {
    expect(ccForSend("ann@x.co.za, bob@x.co.za", "Ann@x.co.za")).toBe("bob@x.co.za");
    expect(ccForSend("ann@x.co.za", "ann@x.co.za, other@x.co.za")).toBeUndefined();
    expect(ccForSend(null, "ann@x.co.za")).toBeUndefined();
  });

  it("each email carries its own template's CC", () => {
    const templates = { ...unset, rfqCc: "rfq@x.co.za", followupCc: "Follow@x.co.za; follow@x.co.za", wipCc: "wip@x.co.za" };
    expect(buildRfqEmailMessage(templates, {}).cc).toBe("rfq@x.co.za");
    expect(buildFollowupEmailMessage(templates, {}).cc).toBe("follow@x.co.za");
    expect(buildWipTableEmailMessage(templates, {}).cc).toBe("wip@x.co.za");
    expect(buildRfqEmailMessage(unset, {}).cc).toBe("");
  });
});
