-- WIP Excel auto-sync per-field conflict protection ("if changes on the
-- system have been made, spreadsheet must not overwrite them"). One flat
-- JSON object per Job, keyed by column name, holding the value the sync
-- engine itself last wrote for every "straight overwrite" field it manages
-- (see OVERWRITE_FIELDS in src/lib/jobs/excel-sync.ts) — a field whose live
-- value no longer matches its entry here is treated as changed by a person
-- in Apollo X since the last sync and left alone on future runs. Nullable,
-- absent entirely for a job the sync has never written to; purely internal
-- bookkeeping, never surfaced in the API/UI.
ALTER TABLE "Job" ADD COLUMN "excelSyncSnapshot" JSONB;
