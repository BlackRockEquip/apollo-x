// ---------------------------------------------------------------------------
// Settings > Import / Export — shared field definitions for Customers,
// Suppliers, Jobs, and the Parts catalog. Used on both sides of the manual
// column-linking step (see ImportExportWorkspace.tsx): the `label`/`aliases`
// here drive the mapping UI and the best-guess auto-mapping, while `key` is
// also what service.ts's mappedValue/mappedDate/etc. look up out of each
// parsed spreadsheet row. Every field here also has a matching export column
// (see exportModuleData in service.ts) with the same label text, in the same
// order — so an exported sheet doubles as this import's own template:
// download it, edit it, and re-import the same file, and every column maps
// itself straight back onto the field it came from.
//
// Ported from ModApp's own Settings > Import/Export (see
// SUPPLIER_IMPORT_FIELDS/CLIENT_IMPORT_FIELDS/JOB_IMPORT_FIELDS in its
// settings/page.tsx) and adapted to Apollo X's own field names and data
// model — see service.ts's header comment for the specific places the two
// apps' models diverge (Apollo X's Customer/Supplier addresses are separate
// child records rather than scalar columns; Apollo X's Job.jobNumber is
// auto-allocated rather than user-supplied).
// ---------------------------------------------------------------------------

export type ImportFieldDef = {
  key: string;
  label: string;
  required?: boolean;
  // A few common header spellings to auto-guess a starting mapping from —
  // the user can always change it afterward, this is just a head start so
  // most imports don't need every field linked by hand. Kept free of
  // overlaps across fields in the same list (see guessMapping in
  // ImportExportWorkspace.tsx, which doesn't exclude a header once another
  // field has claimed it) so two fields never silently fight over the same
  // column.
  aliases?: string[];
};

// Shared by Customers and Suppliers — both create at most one inline
// BILLING address on import, mirroring the single inline address step their
// own "New customer"/"New supplier" forms already offer (see
// inlineAddressInput in master-data/validation.ts). A row with no address
// columns mapped, or a mapped "Address line 1" that's blank, simply gets no
// address — same "blank means skip it" rule as the rest of this import.
export const ADDRESS_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "addressLine1", label: "Address line 1", aliases: ["Address", "Street 1", "Address Line 1", "Billing Street 1"] },
  { key: "addressLine2", label: "Address line 2", aliases: ["Street 2", "Address Line 2", "Billing Street 2"] },
  { key: "addressCity", label: "City", aliases: ["Town", "Billing City"] },
  { key: "addressProvince", label: "Province", aliases: ["State", "Region", "Billing Province"] },
  { key: "addressPostalCode", label: "Postal code", aliases: ["Zip", "Zip Code", "Billing Zip Code"] },
  { key: "addressCountryCode", label: "Country code", aliases: ["Country"] },
];

export const CUSTOMER_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "Customer name", required: true, aliases: ["Company", "Company Name", "Client", "Client Name", "Customer"] },
  { key: "tradingName", label: "Trading name", aliases: ["Trading As"] },
  { key: "accountCode", label: "Account code", aliases: ["Account Number", "Account #", "Account No"] },
  { key: "registrationNumber", label: "Registration number", aliases: ["Reg Number", "Company Reg"] },
  { key: "vatNumber", label: "VAT number", aliases: ["VAT", "VAT No"] },
  { key: "mainTelephone", label: "Telephone", aliases: ["Phone", "Phone Number", "Tel"] },
  { key: "mainEmail", label: "Email", aliases: ["Email Address"] },
  { key: "website", label: "Website", aliases: ["URL"] },
  { key: "currencyCode", label: "Currency code", aliases: ["Currency"] },
  { key: "creditLimit", label: "Credit limit", aliases: ["Credit Limit"] },
  { key: "notes", label: "Notes", aliases: ["Comments"] },
  ...ADDRESS_IMPORT_FIELDS,
];

export const SUPPLIER_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "Supplier name", required: true, aliases: ["Company", "Company Name", "Name"] },
  { key: "accountCode", label: "Account code", aliases: ["Account Number", "Account #", "Account No"] },
  { key: "registrationNumber", label: "Registration number", aliases: ["Reg Number", "Company Reg"] },
  { key: "vatNumber", label: "VAT number", aliases: ["VAT", "VAT No"] },
  { key: "mainTelephone", label: "Telephone", aliases: ["Phone", "Phone Number", "Tel"] },
  { key: "mainEmail", label: "Email", aliases: ["Email Address"] },
  { key: "website", label: "Website", aliases: ["URL"] },
  { key: "currencyCode", label: "Currency code", aliases: ["Currency"] },
  { key: "notes", label: "Notes", aliases: ["Comments"] },
  ...ADDRESS_IMPORT_FIELDS,
];

// Every scalar field jobCreateDraftInput (jobs/validation.ts) accepts,
// except the internal cuid references (stripMechanicId/buildMechanicId/
// relatedJobId) — not practical to fill in from a spreadsheet, same
// "internal bookkeeping, not job data" scope cut ModApp's own Jobs import
// makes for its equivalent id-shaped fields. "jobNumber", "type" and
// "customerName" are the required fields; everything else mirrors what's
// optional on the New Job form itself.
//
// "jobNumber" vs "previousJobNumber" — two distinct fields, per the user's
// explicit correction (they don't mean the same thing, in ModApp's own
// sheets either):
//  - "jobNumber" (this row's own real number, e.g. "BRE001") is used
//    verbatim as the created/updated job's actual Job.jobNumber, in place
//    of Apollo X's normal auto-allocation from the company's own Numbering
//    sequence (see literalJobNumber in jobs/service.ts's createDraftJob).
//    Required — there's no reasonable fallback for a row with no number of
//    its own — and it's also this import's real external key: a row whose
//    "jobNumber" matches an already-existing job in this company UPDATES
//    that job instead of creating a duplicate (see importJobs in
//    service.ts), matching ModApp's own re-import behavior.
//  - "previousJobNumber" (below, near the bottom of this list) is the
//    unrelated "this job relates to a different job" reference — the same
//    purpose as ModApp's own "Linked Job / Project" column.
export const JOB_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "jobNumber", label: "Job number", required: true, aliases: ["Job #", "JOB #", "Job No", "Job Number"] },
  { key: "customerName", label: "Customer", required: true, aliases: ["Client", "Client Name", "Company"] },
  { key: "type", label: "Job type", required: true, aliases: ["Type"] },
  { key: "status", label: "Status", aliases: ["Job Status"] },
  { key: "customerReference", label: "Customer reference", aliases: ["Reference"] },
  { key: "customerPo", label: "Customer PO", aliases: ["Customer Purchase Order"] },
  { key: "dateReceived", label: "Date received", aliases: ["Date In", "Received Date"] },
  { key: "machineMake", label: "Machine make", aliases: ["Make"] },
  { key: "machineModel", label: "Machine model", aliases: ["Model"] },
  { key: "machineSerial", label: "Machine serial", aliases: ["Serial Number"] },
  { key: "component", label: "Component", aliases: [] },
  { key: "componentType", label: "Component type", aliases: ["Unit Type"] },
  { key: "componentSerial", label: "Component serial", aliases: ["Component Serial Number"] },
  { key: "componentPartNumber", label: "Component part number", aliases: ["Part Number", "Part #"] },
  { key: "description", label: "Description", aliases: ["Scope of Work"] },
  { key: "etaDate", label: "Client ETA", aliases: ["ETA"] },
  { key: "mechanicEtaDate", label: "Mechanic ETA", aliases: [] },
  { key: "relationshipNotes", label: "Notes", aliases: ["Comments"] },
  { key: "quoteNumber", label: "Quote number", aliases: ["Quote #"] },
  { key: "quoteDate", label: "Quote date", aliases: [] },
  { key: "salesOrderNumber", label: "Sales order number", aliases: ["SO Number"] },
  { key: "salesOrderDate", label: "Sales order date", aliases: [] },
  { key: "invoiceNumber", label: "Invoice number", aliases: ["Invoice #"] },
  { key: "invoiceDate", label: "Invoice date", aliases: [] },
  { key: "purchaseOrderNumber", label: "Purchase order number", aliases: ["PO Number", "PO #"] },
  { key: "purchaseOrderDate", label: "Purchase order date", aliases: ["PO Date"] },
  { key: "purchaseOrderStatus", label: "Purchase order status", aliases: ["PO Status"] },
  { key: "deliveryDate", label: "Delivery date", aliases: ["POD"] },
  { key: "deliveryType", label: "Delivery transport", aliases: ["Transport Out"] },
  { key: "receivingTransport", label: "Receiving transport", aliases: ["Transport In"] },
  { key: "kmsTravelled", label: "Kms travelled", aliases: ["Kilometers"] },
  { key: "paymentDateReceived", label: "Payment date received", aliases: ["Payment Received"] },
  { key: "machineHours", label: "Machine hours", aliases: ["Hours"] },
  { key: "plantNumber", label: "Plant number", aliases: ["Plant No", "Asset Number"] },
  { key: "reportNumber", label: "Report number", aliases: ["Report #"] },
  { key: "importTrackingNumber", label: "Import tracking number", aliases: ["Tracking Number"] },
  // NOT this row's own job number (see "jobNumber" at the top of this
  // list, and the header comment above it) — this is the separate "this
  // job relates to a different job" reference, matching ModApp's own
  // "Linked Job / Project" column and Apollo X's Job.previousJobNumber
  // field elsewhere in the app (redeploying a "ready to go" PEX unit by
  // its previous job number — see syncPexRedeployment in pex/service.ts).
  // Deliberately no overlap with "jobNumber"'s own aliases above —
  // guessMapping doesn't stop a header being claimed twice, so the two
  // fields must never share an alias or a file's "JOB #" column would
  // auto-link to both.
  { key: "previousJobNumber", label: "Previous job number", aliases: ["Linked Job", "Linked Job / Project", "Linked Project", "Previous Job Number", "Previous Job No"] },
  { key: "salesRepresentative", label: "Sales representative", aliases: ["Sales Rep"] },
];

// 2026-09-10 — user request: "Create a import/export parts catalog in
// settings tab." Mirrors the Parts Catalog master-data form (see
// partInput in master-data/validation.ts) rather than a new shape of its
// own: "Part number" and "Description" are Part's own required fields
// (createMaster already enforces both), everything else here is optional
// on that same form. Two fields aren't plain scalars:
//  - "manufacturerName" (free text, not a manufacturerId) — matched
//    against this company's existing Manufacturer list using the exact
//    same tiered exact/trading-name/fuzzy matching Jobs import already
//    uses for its "Customer" column (see findBestNameMatch in
//    service.ts), generalized to accept a manufacturer's plain name with
//    no trading name of its own. A name that matches nothing on file gets
//    a brand-new Manufacturer created for it automatically, same "don't
//    silently drop the row over a master-data record that hasn't been
//    added yet" behavior Jobs import already gives an unmatched customer
//    name. Blank means no manufacturer link, same as Part's own form.
//  - "taxCode" (a tax code's own short code, e.g. "STD15", not a
//    taxCodeId) — looked up by exact code match within this company. A
//    code that doesn't match any tax code on file is left unmapped for
//    that row (tax codes carry their own rate/effective-date rules, so
//    unlike a manufacturer name this isn't safe to create on the fly from
//    a spreadsheet cell) rather than failing the whole row.
// Parts import is create-only, same as Customers/Suppliers (not
// update-on-reimport like Jobs) — a row whose Part number already exists
// in this company is skipped rather than overwriting an existing part's
// pricing/reorder settings from a stale sheet.
export const PART_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "partNumber", label: "Part number", required: true, aliases: ["Part #", "Part No", "PartNumber", "SKU"] },
  { key: "description", label: "Description", required: true, aliases: ["Part Description"] },
  { key: "manufacturerName", label: "Manufacturer", aliases: ["Manufacturer Name", "Brand", "Make"] },
  // manufacturerPartNumber column removed — 2026-09-16 user request:
  // "remove manufacturer part number from add import parts as its not
  // used." Also dropped from the template download and the mapping in
  // service.ts's importParts.
  { key: "category", label: "Category", aliases: [] },
  { key: "unitOfMeasure", label: "Unit of measure", aliases: ["UOM", "Unit"] },
  // 2026-09-11 — user request: importing parts had no way to seed opening
  // stock, so every imported part landed with zero stock everywhere until
  // someone went and received it by hand afterward. "Bin location" is
  // looked up against this company's existing Storage Locations by exact
  // code (same tier of matching "Tax code" below gets — never
  // auto-created, since a location carries its own required type a
  // spreadsheet cell can't safely infer). "Quantity" is only posted as
  // opening stock when a matching bin location was found for that row;
  // see importParts in service.ts for what happens when it isn't.
  { key: "binLocationCode", label: "Bin location", aliases: ["Bin Location", "Location", "Location Code", "Storage Location", "Bin"] },
  { key: "quantity", label: "Quantity on hand", aliases: ["Qty", "Quantity", "Stock Qty", "Quantity On Hand", "On Hand", "Opening Stock", "Stock On Hand"] },
  { key: "defaultPurchaseCost", label: "Purchase cost", aliases: ["Cost Price", "Purchase Price", "Cost"] },
  { key: "defaultSellingPrice", label: "Selling price", aliases: ["Sell Price", "Selling Price", "Price"] },
  { key: "taxCode", label: "Tax code", aliases: ["Tax Code", "VAT Code"] },
  { key: "reorderMinimum", label: "Reorder minimum", aliases: ["Min Stock", "Reorder Min", "Minimum Stock"] },
  { key: "reorderMaximum", label: "Reorder maximum", aliases: ["Max Stock", "Reorder Max", "Maximum Stock"] },
  { key: "reorderQuantity", label: "Reorder quantity", aliases: ["Reorder Qty"] },
  { key: "notes", label: "Notes", aliases: ["Comments"] },
];

export const IMPORT_EXPORT_MODULE_LABELS = {
  customers: "customers",
  suppliers: "suppliers",
  jobs: "jobs",
  parts: "parts catalog",
} as const;

export type ImportExportKind = keyof typeof IMPORT_EXPORT_MODULE_LABELS;
