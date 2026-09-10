# Apollo X vs ModApp — cross comparison

Both read directly from the two project folders on your machine (`C:\Projects\Apollo X Working` and `C:\Projects\ModApp`) on 2026-09-09.

## What each one actually is

**ModApp** (`C:\Projects\ModApp`) is your existing, live, feature-complete production system. Its README calls it "ModApp — Job & Client Management Platform" — a multi-company job, inventory, client, warranty and field-service system with a Super Admin who creates companies and toggles modules per company. It has real integrations already wired in: a file-watcher (`src/lib/jobSync.ts`) that syncs a live Excel workbook (`JOBS_SYNC_FILE_PATH`, e.g. a OneDrive "WIP - Workshop.xlsx") straight into Jobs, RFQ emailing to suppliers with PDF/Word/Excel quote extraction, per-company SMTP settings, document branding/templates, and API keys for external connections. Job numbers use the `BRE###` format (e.g. `BRE001`), confirming this is Black Rock Equipment's real operating system, not just a demo — "Bremner"/"Coastal" in the README are just seed/demo company names for local dev.

It also quietly hosts a second, unrelated product on the same codebase: **Ringball**, a sports-league management system (divisions, teams, players, games, live scoring, sporting councils) — reachable from the same login screen via a `SPORTSLEAGUE` module code, alongside ModApp's own `JOBMANAGE` code. That's why the login page you hit at `localhost:3000` showed "Component Workshop" and "Sports League" as module choices — that page belongs to ModApp, not Apollo X.

**Apollo X** (`C:\Projects\Apollo X Working`) is the from-scratch rebuild — a clean multi-tenant architecture, currently about halfway through its own domain (jobs/kits/PEX just landed; quotes, sales orders, invoices, payments, procurement, and reporting exist only as permission strings and module keys, with no UI or service code yet). Its own docs (`docs/phase-2-reference-mapping.md`) describe reconciling two legacy sources when designing master data — "old Apollo" and a "Mornay source" with `Client`/`ClientBranch`. ModApp matches the "Mornay source" description closely (structured `Client`, contacts, aliases, supplier brand tags) but its current schema has **no `ClientBranch` model at all** — either that concept was simplified out of ModApp since the mapping doc was written, or the mapping was describing an even earlier version of this codebase. Worth confirming with whoever wrote that doc before it's used to drive an import.

## Tech stack

| | ModApp | Apollo X |
|---|---|---|
| Framework | Next.js 16.3.1, React 19 | Next.js 16.3.1, React 19 (same) |
| Styling | Tailwind CSS | Hand-rolled CSS |
| Auth | `jose` (JWT) + `bcryptjs` | `argon2` (own session table) |
| ORM | Prisma 5.22 | Prisma 5.22 (same) |
| Extras | `chokidar` (file watch), `mammoth` (docx), `pdf-parse`, `xlsx` (SheetJS) — all for import/extraction workflows | none of these — no document-extraction tooling yet |
| Tests | none visible in package.json scripts | Vitest, unit + integration suites per phase |

Apollo X has real automated test coverage; ModApp appears to have none (no test script, no test framework in `package.json`). That's a meaningful risk-reduction ModApp lacks and Apollo X is deliberately building in from the start.

## Tenancy, roles and permissions

- **ModApp**: a single `Role` enum (`SUPER_ADMIN, COMPANY_ADMIN, MANAGER, USER, STORE_CONTROLLER`) shared across platform and tenant concerns — a Super Admin is just one more value of the same enum a normal user has, picking which company to view from a dropdown. Permissions are a mix of hardcoded role checks (`rbac.ts`) and a newer granular `RolePermission`/`UserPermission` override system layered on top (added 2026-08-24 per the code comments).
- **Apollo X**: cleanly separates `TenantRole` (6 values, adds `SALES` and `FINANCE` that ModApp doesn't have) from `PlatformRole`, with an explicit, audited `PlatformSupportAccess` mechanism (a platform operator has to open a logged "support context" with a reason to act inside a tenant, rather than just switching a dropdown). Its permission system is more fine-grained from day one (100+ explicit permission strings vs ModApp's smaller, more recently-retrofitted set) — this looks like a deliberate hardening of ModApp's simpler model based on lessons learned.
- Both use per-company module toggles, but Apollo X's `ModuleKey` enum has 22 values (many for modules not built yet: Quotes, Sales Orders, Invoices, Payments, Procurement, Notifications, Attachments, Import/Export, Rebuilds) vs ModApp's 8 (`JOBS, CLIENTS, INVENTORY, OUTWORK, WARRANTY, FIELD, PEX, REPORTING`) — all of which are actually implemented.

## Jobs — the core of both systems

- **Status model**: ModApp's `JobStatus` enum is a single flat list (24 values) shared across three *different* workflows selected in application code (`JOB_STATUS_STEPS`, `FIELD_JOB_STATUS_STEPS`, `PARTS_SUPPLY_STATUS_STEPS` — an 11-stage main workshop flow, a 5-stage field flow, and a 6-stage parts-supply flow, plus a `RETURNED_UNREPAIRED` off-ramp state). Apollo X currently has one unified 13-status flow (`DRAFT → ... → COMPLETE/CLOSED/CANCELLED`) for every job type — simpler, but doesn't yet capture ModApp's type-specific branching flows (particularly the field-service and returned-unrepaired states, which don't have an Apollo X equivalent yet).
- **Job type**: ModApp's `jobType` used to be a fixed enum but was deliberately changed (2026-08-22) to a plain string keyed against a per-company, user-editable `JobTypeConfig` table — so each company can define its own job types through the UI. Apollo X's `JobType` is still a fixed Prisma enum (`STANDARD_REPAIR, PARTIAL_REPAIR, PEX_SUPPLY, PEX_RETURN, OUTRIGHT_SALE, FIELD_SERVICE, WARRANTY`) — less flexible, but simpler and type-safe. This is a real product decision to make: Apollo X will eventually need to decide whether to match ModApp's "companies define their own job types" flexibility.
- **Job fields**: ModApp's `Job` model carries considerably more real-world detail already: quote/sales-order/invoice/PO numbers and dates, two separate delivery legs (`deliveryType`/`receivingTransport`), a client-facing ETA vs. a staff-only mechanic ETA, payment tracking (`paymentDateReceived`, `paymentNotApplicable`), machine hours, plant number, km travelled for field jobs, and `previousJobNumber`/`importTrackingNumber` for tracing history. Apollo X's `Job` model is leaner — it hasn't built quoting/invoicing/payment fields yet (those live only as unused permission strings), so this gap will close naturally as those modules get built, but it's useful to treat ModApp's `Job` model as the field-level spec to match.

## PEX (core-exchange) modelling

Both systems implement the same real-world workflow — a stripped component becomes exchangeable stock, gets supplied against another job, and a "core" is expected back — but structure it differently:

- **ModApp**: one `PexRecord` per unit-cycle, with nullable `supplyJobId`/`returnJobId`/`consumedByJobId` pointers straight at `Job`, a single `PexStatus` enum (`TO_BE_DELIVERED → OUTSTANDING → RECEIVED → IN_REPAIR → COMPLETED`, or `SCRAPPED`), and a `consumedByJob` link for when a "ready to go" unit gets redeployed through a different job (matched via `previousJobNumber` text matching in `syncPexConsumption`).
- **Apollo X**: splits this into two models — `PexStockUnit` (the physical exchangeable item, with its own `AVAILABLE/SUPPLIED/QUARANTINE/SCRAPPED` status and a storage-location FK) and `PexSupplyLink` (one row per supply↔return job pair, carrying expected-vs-returned core description/type/part-number/serial for mismatch detection, plus a `closedWithoutReturn` path). This is more normalized and adds structured mismatch tracking that ModApp does with a free-text match — an improvement, but means Apollo X's importer will need to reconstruct `PexStockUnit`/`PexSupplyLink` pairs from ModApp's flatter `PexRecord` rows plus `previousJobNumber` string-matching.

## What ModApp has that Apollo X doesn't have yet

- RFQ/quote workflow with supplier email sending and PDF/Word/Excel quote-line extraction (`RfqRequest`, `RfqQuote`, `RfqQuoteLine`, `QuoteComparisonSection.tsx` — 31KB)
- Delivery notes and pick slips as first-class documents (`JobDeliveryNote`, `PickSlip`) with print layouts
- Document branding/templates (`DocumentTemplate`, `printSections/*` for job cards, delivery notes, pick slips)
- Notifications with per-user dismissal (`Notification`, `NotificationDismissal`)
- Attachments as a first-class model (warranty docs, parts lists)
- An audit log (`AuditLog`) and API keys for external connections/webhooks (`ApiKey`, `ExternalConnection`)
- The live Excel-workbook job sync described above
- CSV import/export tooling (`settings/import-export-actions.ts`, 59KB) with client-merge/dedup logic (`mergeClients`) and alias tracking

Apollo X's own docs already flag most of this as deferred/future work (its `ModuleKey` enum reserves slots for Quotes, Sales Orders, Invoices, Payments, Notifications, Attachments, Import/Export) — so this list is effectively Apollo X's build backlog, now with a working reference implementation to build against.

## What Apollo X has that ModApp doesn't

- The audited platform support-access model (`PlatformSupportAccess`) — ModApp's Super Admin has no equivalent audit trail for acting inside a tenant
- Structured customer branch/contact/address as separate tenant-keyed children with typed address kinds — ModApp's `Client` has one flat billing address and a bare `ClientContact` list, no branches
- First-class `TaxCode` (effective-dated), `CommercialTerm`, and `DocumentNumberSequence` models — ModApp has no equivalent tax/commercial-terms/numbering abstraction; numbering is just a `jobNumber` string field
- Automated test coverage (Vitest unit + integration suites per phase)
- The `SALES` and `FINANCE` tenant roles

## One thing worth flagging

`RingballApp` also exists as a sibling folder under `C:\Projects`, separate from the `ringball` module embedded inside ModApp itself — worth checking whether that's an earlier standalone extraction, a fork, or stale, since having the same feature in two places is an easy way to end up maintaining drift you don't need.

## Bottom line for the Apollo X rebuild

ModApp is the de facto specification: it's what Black Rock Equipment actually runs today, with real fields, real workflows, and real integrations shaped by production use (the code comments throughout `rbac.ts`, `modules.ts`, and `schema.prisma` read like a running decision log — dated, reasoned, and specific). Apollo X is a deliberately more disciplined re-architecture (cleaner tenancy/audit model, normalized PEX, real tests) but is currently behind ModApp in feature surface area, particularly quoting, invoicing, documents, and import/export. The practical path is treating ModApp's schema and workflows as the functional spec for each remaining Apollo X phase, while carrying forward Apollo X's stricter data model where it's already provably better (customer structure, tax/terms/numbering, PEX normalization).
