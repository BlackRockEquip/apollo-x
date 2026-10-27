# Add parts by typing or pasting only; Availability column in Compare quotes (2026-10-27)

Requests:
1. When adding parts to a job, remove the import parts list. A user only types or pastes the parts required, so nobody has to check spreadsheet columns and naming.
2. In Compare quotes add an Availability column that reads the lead time for parts when the supplier gives one. Sample quotes supplied: Babcock, Blumaq, CEP, SLP, Sparepower, TGS (PDFs).

## 1. Add parts: type or paste only
- Removed from the job Parts tab (and the tablet "Add parts" sheet): the file chooser, the template download button, the file import handler. The button is now "Add parts".
- New reader `src/lib/jobs/parts-paste.ts` (pure, tested in `tests/unit/parts-paste.test.ts`). Part number first, then the next thing that reads as a quantity, the rest is the description. Accepts commas, tabs (Excel paste), semicolons, pipes or plain spaces; "x2", "2x", "2 pcs", "qty 2", "PN - 2"; a line with only a part number adds 1; a pasted heading row ("Part number, Qty, Description") and bullets are ignored. A trailing bare number stays in the description ("Hydraulic seal 10" is not quantity 10); only "x2"/"2x" at the end counts as a quantity.
- Server `addPartLinesBulk` (`src/lib/jobs/service.ts`) uses it and returns `skipped` (lines with no part number or a zero/negative quantity). The screen leaves those lines in the box with a note and keeps the section open; the rest are added. Duplicate and stock handling are unchanged.
- The server still accepts a file payload on that endpoint (unused by the screen). Job kits keep their own paste/import (not asked).

## 2. Availability column
- New column `JobRfqQuoteLine.leadTime` (text, optional). Migration `20261027130000_rfq_quote_line_lead_time`. Cleared when a line is marked N/A.
- `src/lib/rfq/lead-time.ts` turns what suppliers print into one short phrase: STOCK / STK / AVAILABLE IMMEDIATELY / YES / "in stc" -> "In stock"; "7 DAYS" -> "7 days"; "10-14 Days" and "10d-14d" -> "10-14 days"; "5 TO 10 WORKING DAYS" -> "5-10 working days"; "3 HOURS" -> "3 hours"; Babcock's description notes: "(6stc 2pdc)" -> "6 in stock, 2 PDC", "pdc" -> "PDC", "ex sweden" -> "Ex Sweden".
- `quote-extraction.ts`: `guessFromTextDetailed` / `guessQuoteFromFile` return price and lead time from the same quote row; `guessFromText` and `guessPricesFromFile` still return prices only. Spreadsheets: a "Lead time / Delivery / Availability / Delay / ETA / Available" column is read when present. `recordRfqQuote` returns `leadTimes` (by part line id) next to `guesses`.
- Price entry screen: new Availability box per line (editable, Enter moves down). Import fills it only where the price is filled, never over something typed. Save stores it (`PATCH .../quote/lines` accepts `leadTime`).
- Compare prices screen: a line under each price shows the availability ("In stock" in green); the supplier columns are a little wider and rows taller.
- CSV and Excel exports: a third column per supplier, "(availability)".

Checked against all six sample PDFs (rows extracted the same way the app does): Blumaq (Delay column), CEP (Lead time column; "Unavailable" rows stay N/A), Sparepower (Lead Time ETA), TGS (STK / 10d-14d), SLP (Available = YES -> In stock), Babcock (notes only; a part with no note shows blank).

Known limits: when a supplier splits one part across lines (Sparepower 7 + 9 + 20, TGS 4 + 2) the first/best-matching line's lead time is shown, not each split. "PDC" and "Ex Sweden" are shown as printed. Spreadsheet price cells like "R 10.50" still do not parse (existing behaviour).

## Checks done
Vitest in the mini tree (112 tests, new `quote-lead-time.test.ts` and `parts-paste.test.ts`). Prisma-typed code reviewed by hand (sandbox cannot run `prisma generate`); Render's build type check is the real test.

## To test
Job, Parts, Add parts to Job: paste a few lines in different styles; confirm a zero-quantity line stays in the box with a note. Compare quotes: import each supplier's PDF and read the Availability column; edit one, Save, reopen; Compare prices shows the line under the price; export CSV.

Push: `push/push-parts-paste-quote-availability.ps1` (has a migration).
