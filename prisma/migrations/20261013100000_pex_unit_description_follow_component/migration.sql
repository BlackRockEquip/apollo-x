-- PEX records now take their unit name from the job's Component field (kept in step on every job save).
-- One-off catch-up for records whose name was copied earlier and has since gone out of date.
UPDATE "PexRecord" p
SET "unitDescription" = btrim(j."component")
FROM "Job" j
WHERE p."status" <> 'SCRAPPED'
  AND j."id" = COALESCE(p."returnJobId", p."supplyJobId")
  AND btrim(COALESCE(j."component", '')) <> ''
  AND p."unitDescription" IS DISTINCT FROM btrim(j."component");
