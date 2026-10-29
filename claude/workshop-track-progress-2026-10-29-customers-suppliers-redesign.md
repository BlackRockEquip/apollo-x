# Customers and Suppliers redesign, with jobs received / sent back (2026-10-29)

Request: "lets fix customers and suppliers also, mockup for me a professional UI for both and also list within each a section for jobs sent/received basically like a wip view", then "Build it" (mockup approved).

## What changed for the user

**Lists (Customers, Suppliers)**
- Header with Merge and New buttons, four summary tiles, search, Active / Inactive / All switch and a "Has open jobs" (customers) / "Has work out" (suppliers) filter, count, table and pager.
- Customers: avatar + name + account code, primary contact + email, telephone, open jobs, jobs in last 12 months, last job in, status.
- Suppliers: avatar + name + code, primary contact + email (RFQ badge when a contact can receive RFQs), telephone, brand chips (first two, then +n), items out, overdue, status.
- View / Edit / Clone / Merge / New all behave as before (same drawer, same merge dialog, same clone confirm). Search, status and page are still remembered when you come back.
- The Suppliers page no longer draws its own heading above the list; the list draws it.

**Detail pages**
- Back link, avatar header with account code, status, "Account on hold" and city chips; Edit account from list and New job (customers) / Open Outwork (suppliers).
- Tab strip with counts (Branches, Contacts, Addresses, Brands). The other tabs (records, brands, commercial, activity, add/edit drawer) are unchanged.
- Overview: four tiles, then a **Jobs** section like WIP and a side column.
  - Customers: Received (still with us) / Sent back (ready to deliver, delivered, complete, closed, cancelled, returned unrepaired) / All. Columns: Job #, Type, Status pill, Machine, Component, Date in, ETA (red and "overdue" when past) or Delivered. Tiles: In the workshop, Overdue ETA, Sent back, Warranty jobs (share of their jobs).
  - Suppliers: Sent out (still with the supplier) / Received back / All outwork. Columns: Job #, Customer, Description, Qty, Status (With supplier / Overdue / Received back), Sent, Received, Days. Tiles: Out with supplier, Overdue (more than 7 days), Received back (last 90 days), Avg turnaround.
  - Side column: primary contact (customers) or contacts with RFQ badges (suppliers), account details, brands (suppliers), commercial, billing address (customers).

## How it is built
- `src/lib/master-data/party-model.ts` (pure, tested): isOpenJob, isOverdueEta, outworkState (over 7 days = overdue), outworkDaysOut, avgTurnaroundDays, summarize helpers.
- `src/lib/master-data/party-service.ts`: row stats (open jobs, jobs 12 mo, last job; work out, overdue), list tiles, `listCustomerJobs`, `listSupplierOutwork`. Job numbers are only returned to users who can view Jobs; others see dashes and a "no access" note.
- API (all read-only): `GET /api/v1/customers/summary`, `/suppliers/summary`, `/customers/[id]/jobs`, `/suppliers/[id]/jobs`. `listMaster` for customers/suppliers now adds `stats`, `primaryContactEmail`, `brandList`, `rfqReady` and accepts `activity=open`.
- UI: `PartyListView.tsx` (list layout, used by MasterDataWorkspace for customers/suppliers only), `PartyJobs.tsx` (hook + tiles + Jobs card), `PartyBits.tsx`, redesigned Overview in `PartyDetailWorkspace.tsx`; styles are the `pt-` block at the end of globals.css.
- `src/lib/ui/job-tone.ts` now exports `SENT_BACK_STATUSES` so the "sent back" rule is the same on screen and in the query.
- Test: `tests/unit/party-model.test.ts` (14 tests).

## Decisions and assumptions
- "Open" job = not complete, closed or cancelled, and not returned unrepaired. "Jobs, 12 mo" counts jobs created in the last 12 months. "Last job in" = most recent job creation date.
- Outwork only has two statuses (Sent out / Received), so there is no "Partly received" state. Overdue = out for more than 7 days.
- Open RFQs tile from the mockup was replaced by "Brands covered" because RFQ status is spread over two models; easy to add later.
- Account on hold hint says "Marked on hold on the account" (we do not enforce anything with it here).
- Edit account still opens from the list (the edit drawer lives there); New job opens a blank new job (no customer prefill exists yet).
- No migration, no schema change.

## Verification
- 14 unit tests pass; type-check of the new components is clean (Prisma-typed server code hand-reviewed: sandbox cannot run prisma generate).
- Rendered list and detail layouts with sample data in a browser harness and compared to the approved mockup.
- Push: `push\push-customers-suppliers-redesign.ps1`.
