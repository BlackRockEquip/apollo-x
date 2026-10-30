# Workshop Track progress — 2026-10-30 — Machinists per job item (Reassign machinist)

**Request:** machinists are assigned per job (Machinist 'Assess' = Job.stripMechanicId, 'Final' = Job.buildMechanicId); make it so an item can have different machinists. (The "Reassign machinist" button from the mockup had been left out for this reason.)

## Design
- `JobItem.stripMechanicId` / `buildMechanicId` (nullable FK -> Mechanic, ON DELETE SET NULL). **null = the item follows the job's machinist**, so nothing existing is backfilled. Effective machinist = item's own else job's (`itemMachinists` in `lib/jobs/item-model.ts`).
- **MIGRATION:** `prisma/migrations/20261030090000_job_item_machinists` (two columns, two indexes, two FKs). Applies on Render deploy; locally `npx prisma migrate deploy` + `npx prisma generate`.

## Changes
- `schema.prisma`, migration; `lib/jobs/validation.ts` (`jobItemInput` takes both ids; update input inherits via `.partial()`).
- `lib/jobs/service.ts`: `itemData`, `checkItemMachinists` (must belong to the company), createJob (multi-item), addJobItem, updateJobItem; machinist change writes its own ITEM_UPDATED activity line (old -> new, "same as the job" for blank); list select now returns item + job machinist names.
- `JobItemsPanel`: Machinists column (own = bold, inherited = grey), selected item shows both ("from the job"), **Reassign machinist** button + inline two-picker form, same pickers in Edit item. `JobItemsEditor` (New Job): pickers per item once there are 2+ items. `item-draft.ts` carries the ids.
- `JobWorkspace`: passes machinists to both; job-level boxes get a hint when the job has items; job card print + saved PDF items table gets a "Machinists" column (`job-specs.ts` `jobCardItemsTable` options, `JobDocLabels.itemMachinists`).
- Jobs & WIP list (`jobs/page.tsx`): machinists on each expanded item row.
- Tests: `tests/unit/item-machinists.test.ts` (+ existing job-items suite: 65 pass).

## Notes / limits
- One-item (virtual) jobs keep using the job's machinist boxes; no per-item picker until a 2nd item exists. A single-item New Job ignores per-item machinists.
- The WIP list columns / dashboards that group by machinist (none today) would still read the job's machinists.
- Type-check here shows only the expected "Prisma client not regenerated" errors for the new columns; they go away after `npx prisma generate`. Rendered the item panel in Chrome with sample data (column, Reassign form).
- Push: `push\push-item-machinists.ps1`.
