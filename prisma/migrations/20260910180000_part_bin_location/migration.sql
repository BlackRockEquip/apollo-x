-- Add an optional default bin/storage location to Part, so the merged
-- Stock Levels page (Parts Catalog folded in) can assign, change, or clear
-- a part's default bin without touching the per-location StockBalance
-- ledger rows. SetNull on delete: removing the referenced StorageLocation
-- clears the part back to "no default bin" rather than being blocked,
-- consistent with manufacturerId/taxCodeId on the same table.
ALTER TABLE "Part" ADD COLUMN "binLocationId" TEXT;

CREATE INDEX "Part_companyId_binLocationId_idx" ON "Part"("companyId", "binLocationId");

ALTER TABLE "Part" ADD CONSTRAINT "Part_binLocationId_fkey" FOREIGN KEY ("binLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
