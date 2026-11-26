-- Failure Reports: page 1 (cover) and page 2 photos are chosen one by one; photos added in bulk go to the photo pages (page 3 on).
ALTER TABLE "FailureReportPhoto" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'page';

-- Reports made before this change used the order: photo 1 = cover, photo 2 = page 2. Keep them looking the same.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "reportId" ORDER BY "sortOrder", "createdAt") AS rn
  FROM "FailureReportPhoto"
)
UPDATE "FailureReportPhoto" p
SET "role" = CASE WHEN r.rn = 1 THEN 'cover' ELSE 'intro' END
FROM ranked r
WHERE p."id" = r."id" AND r.rn <= 2;
