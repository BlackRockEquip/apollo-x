-- User request: "make the Notes field like the Job description field,
-- remove the add note button, notes will stay in the field as you type."
-- Replaces the old add/edit/delete list of separately-timestamped
-- JobNote entries with one shared free-text field on Job, autosaved
-- exactly like Job.description.
--
-- Adds the new column, then backfills it from every job's existing
-- JobNote rows (oldest first, separated by a blank line) so nothing
-- already typed is lost. The JobNote table itself is left in place —
-- unused by the app going forward, but its rows (and the original
-- per-entry author/timestamp history) still exist in the database rather
-- than being dropped.
ALTER TABLE "Job" ADD COLUMN "notes" TEXT;

UPDATE "Job" j
SET "notes" = sub.combined
FROM (
  SELECT "jobId", string_agg("note", E'\n\n' ORDER BY "createdAt" ASC) AS combined
  FROM "JobNote"
  GROUP BY "jobId"
) sub
WHERE j.id = sub."jobId";
