import { describe, expect, it } from "vitest";
import { leadTimeFromCells, leadTimeFromDescription, normalizeLeadTime } from "@/lib/rfq/lead-time";
import { guessFromText, guessFromTextDetailed, leadTimeFromSheetCell } from "@/lib/rfq/quote-extraction";
import { draftToCell, isInStockLead, quoteLineToCell } from "@/components/quote-compare/compare-model";

// 2026-10-27, user request (Compare quotes): an Availability column that reads the lead time for parts when the
// supplier gives one. The rows below are laid out the way the real PDFs of six suppliers read (cells joined by tabs).
const row = (...cells: string[]) => cells.join("\t");

describe("normalizeLeadTime", () => {
  it("reads stock wording as In stock", () => {
    for (const word of ["STOCK", "STK", "stc", "in stock", "AVAILABLE IMMEDIATELY", "Available", "YES", "ex stock"]) {
      expect(normalizeLeadTime(word)).toBe("In stock");
    }
  });

  it("tidies days, working days, hours and weeks", () => {
    expect(normalizeLeadTime("7 DAYS")).toBe("7 days");
    expect(normalizeLeadTime("1 day")).toBe("1 day");
    expect(normalizeLeadTime("1 working day")).toBe("1 working day");
    expect(normalizeLeadTime("10-14 Days")).toBe("10-14 days");
    expect(normalizeLeadTime("10d-14d")).toBe("10-14 days");
    expect(normalizeLeadTime("5 TO 10 WORKING DAYS")).toBe("5-10 working days");
    expect(normalizeLeadTime("1 TO 2 WORKING DAYS")).toBe("1-2 working days");
    expect(normalizeLeadTime("3 HOURS")).toBe("3 hours");
    expect(normalizeLeadTime("2-3 weeks")).toBe("2-3 weeks");
    expect(normalizeLeadTime("5d")).toBe("5 days");
  });

  it("leaves everything that is not a lead time alone", () => {
    for (const cell of ["", "7", "10+", "R52,00", "NUT", "AFTERMARKET", "Unavailable", "CTP-NEW", "PCS", "0.09", "36"]) {
      expect(normalizeLeadTime(cell)).toBeNull();
    }
    expect(normalizeLeadTime(undefined)).toBeNull();
  });
});

describe("leadTimeFromDescription (Babcock's notes after the description)", () => {
  it("reads stock, PDC and overseas notes", () => {
    expect(leadTimeFromDescription("TEMPERATURE SENSOR in stc")).toBe("In stock");
    expect(leadTimeFromDescription("O-RING pdc")).toBe("PDC");
    expect(leadTimeFromDescription("BEARING(6stc 2pdc)")).toBe("6 in stock, 2 PDC");
    expect(leadTimeFromDescription("ROLLER BEARING ex sweden")).toBe("Ex Sweden");
  });

  it("does not take a count from inside a part number", () => {
    expect(leadTimeFromDescription("SEALING RING-SS-VOE11168122 pdc")).toBe("PDC");
  });

  it("finds nothing in an ordinary description", () => {
    expect(leadTimeFromDescription("WHEEL NUT(branches)")).toBeNull();
    expect(leadTimeFromDescription("EX WORKS")).toBeNull();
    expect(leadTimeFromDescription("")).toBeNull();
  });
});

describe("leadTimeFromCells", () => {
  it("prefers a lead time cell over a note in the description", () => {
    expect(leadTimeFromCells(["WHEEL NUT in stc", "7 DAYS"])).toBe("7 days");
    expect(leadTimeFromCells(["WHEEL NUT in stc", "36"])).toBe("In stock");
    expect(leadTimeFromCells(["WHEEL NUT", "36"])).toBeNull();
  });
});

describe("lead times read from each supplier's quote", () => {
  it("Blumaq: Delay column", () => {
    const text = [
      row("It.", "Part Number", "Qua", "Ava", "Description", "Weight", "Price", "Amount", "Delay"),
      row("10", "1077694", "1", "1", "SPACER", "0.09", "144.00", "144.00", "7 DAYS"),
      row("20", "1512939", "7", "7", "MAIN BEARING STD.", "0.32", "224.00", "1,568.00", "STOCK"),
    ].join("\n");
    expect(guessFromTextDetailed(text, ["1077694", "1512939"], { "1077694": 1, "1512939": 7 })).toEqual({
      "1077694": { price: 144, leadTime: "7 days" },
      "1512939": { price: 224, leadTime: "In stock" },
    });
  });

  it("CEP: Lead time column, and an unavailable part gets neither price nor lead time", () => {
    const text = [
      row("4695312", "4695312", "LINER-CYLI", "UNK", "NEW", "10-14 Days", "0.00", "1", "R 1,764.00", "R 1,764.00"),
      row("1077694", "1077694", "PLATE THRUST", "CEP", "NEW", "Unavailable", "0.09", "0", "R 0.00", "R 0.00"),
      row("2463150", "2463150", "PLATE-THRUT", "UNK", "NEW", "3 HOURS", "0.14", "2", "R 285.65", "R 571.30"),
    ].join("\n");
    const found = guessFromTextDetailed(text, ["4695312", "1077694", "2463150"], { "4695312": 1, "1077694": 1, "2463150": 2 });
    expect(found["4695312"]).toEqual({ price: 1764, leadTime: "10-14 days" });
    expect(found["1077694"]).toBeUndefined();
    expect(found["2463150"]).toEqual({ price: 285.65, leadTime: "3 hours" });
  });

  it("Spare Power: Lead Time (ETA) column, with stock counts beside it ignored", () => {
    const text = [
      row("928966", "GAC6572SRP", "O-RING", "928966", "AFTERMARKET", "AVAILABLE IMMEDIATELY", "5", "0", "R45,00", "0,00", "R45,00", "2", "R90,00"),
      row("15194310", "GAC9561SRP", "DRIVE GEAR SET", "15194310", "AFTERMARKET", "5 TO 10 WORKING DAYS", "0", "0", "R37 200,33", "0,00", "R37 200,33", "1", "R37 200,33"),
    ].join("\n");
    const found = guessFromTextDetailed(text, ["928966", "15194310"], { "928966": 2, "15194310": 1 });
    expect(found["928966"]).toEqual({ price: 45, leadTime: "In stock" });
    expect(found["15194310"]).toEqual({ price: 37200.33, leadTime: "5-10 working days" });
  });

  it("TGS: Lead Time column (STK / 10d-14d)", () => {
    const text = [
      row("1", "1077694", "1", "PLATE THRUST", "CTP-NEW", "1", "PCS", "0.09", "10d-14d", "177.71", "177.71"),
      row("2", "1512939", "7", "BEARING MAIN STD C9", "CTP-NEW", "7", "PCS", "2.23", "STK", "209.33", "1,465.31"),
    ].join("\n");
    const found = guessFromTextDetailed(text, ["1077694", "1512939"], { "1077694": 1, "1512939": 7 });
    expect(found["1077694"]).toEqual({ price: 177.71, leadTime: "10-14 days" });
    expect(found["1512939"]).toEqual({ price: 209.33, leadTime: "In stock" });
  });

  it("SLP: Available column of YES", () => {
    const text = row("947972", "WHEEL NUT WN-972", "F403", "36", "YES", "24.00", "864.00");
    expect(guessFromTextDetailed(text, ["947972"], { "947972": 36 })["947972"]).toEqual({ price: 24, leadTime: "In stock" });
  });

  it("Babcock: only a note after the description", () => {
    const text = [
      row("5", "VOE11103303", "O-RING in stc", "2.000", "319.79", "0.00", "0.00 %", "319.79", "639.58"),
      row("9", "VOE11035001", "BEARING(6stc 2pdc)", "8.000", "3,147.41", "0.00", "0.00 %", "3,147.41", "25,179.28"),
      row("1", "VOE947972", "WHEEL NUT(branches)", "36.000", "199.51", "0.00", "0.00 %", "199.51", "7,182.36"),
    ].join("\n");
    const found = guessFromTextDetailed(text, ["11103303", "11035001", "947972"], { "11103303": 2, "11035001": 8, "947972": 36 });
    expect(found["11103303"]).toEqual({ price: 319.79, leadTime: "In stock" });
    expect(found["11035001"]).toEqual({ price: 3147.41, leadTime: "6 in stock, 2 PDC" });
    expect(found["947972"]).toEqual({ price: 199.51, leadTime: null });
  });

  it("takes the lead time from the same line as the price when a part is quoted twice", () => {
    const text = [
      row("1", "4695312", "1", "LINER", "STOCK", "1", "PCS", "0.00", "1,764.00", "1,764.00"),
      row("2", "4695312", "6", "LINER", "10d-14d", "6", "PCS", "0.00", "1,031.29", "6,187.74"),
    ].join("\n");
    expect(guessFromTextDetailed(text, ["4695312"], { "4695312": 6 })["4695312"]).toEqual({ price: 1031.29, leadTime: "10-14 days" });
  });

  it("guessFromText still returns plain prices", () => {
    const text = row("20", "1512939", "7", "7", "MAIN BEARING STD.", "0.32", "224.00", "1,568.00", "STOCK");
    expect(guessFromText(text, ["1512939"], { "1512939": 7 })).toEqual({ "1512939": 224 });
  });
});

describe("leadTimeFromSheetCell", () => {
  it("tidies wording and reads bare numbers under a lead time heading", () => {
    expect(leadTimeFromSheetCell("STOCK", "lead time")).toBe("In stock");
    expect(leadTimeFromSheetCell("7", "lead time (days)")).toBe("7 days");
    expect(leadTimeFromSheetCell(2, "lead time (weeks)")).toBe("2 weeks");
    expect(leadTimeFromSheetCell("7", "available")).toBeNull();
  });

  it("keeps a short note as the supplier wrote it, and drops blanks and a plain no", () => {
    expect(leadTimeFromSheetCell("ex Germany", "delivery")).toBe("ex Germany");
    expect(leadTimeFromSheetCell("", "delivery")).toBeNull();
    expect(leadTimeFromSheetCell("No", "available")).toBeNull();
  });
});

describe("lead time in the compare model", () => {
  it("carries the lead time on a price cell, and only when there is one", () => {
    expect(draftToCell({ unitPrice: "10", available: true, leadTime: " 7 days " })).toEqual({ kind: "price", unit: 10, lead: "7 days" });
    expect(draftToCell({ unitPrice: "10", available: true, leadTime: "" })).toEqual({ kind: "price", unit: 10 });
    expect(draftToCell({ unitPrice: "10", available: false, leadTime: "7 days" })).toEqual({ kind: "na" });
    expect(draftToCell({ unitPrice: "", available: true, leadTime: "7 days" })).toEqual({ kind: "none" });
    expect(quoteLineToCell({ available: true, unitPrice: "5", leadTime: "In stock" })).toEqual({ kind: "price", unit: 5, lead: "In stock" });
    expect(quoteLineToCell({ available: true, unitPrice: "5", leadTime: null })).toEqual({ kind: "price", unit: 5 });
  });

  it("knows an in-stock lead time", () => {
    expect(isInStockLead("In stock")).toBe(true);
    expect(isInStockLead("6 in stock, 2 PDC")).toBe(false);
    expect(isInStockLead(null)).toBe(false);
  });
});
