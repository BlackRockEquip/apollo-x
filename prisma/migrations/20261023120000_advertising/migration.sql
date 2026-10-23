-- Platform > Advertising (2026-10-23)
ALTER TABLE "CompanySettings" ADD COLUMN "hideAds" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "AdAudience" AS ENUM ('ALL', 'SELECTED');

CREATE TABLE "Advertisement" (
    "id" TEXT NOT NULL,
    "advertiser" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT,
    "buttonText" TEXT NOT NULL DEFAULT 'Learn more',
    "linkUrl" TEXT NOT NULL,
    "imageData" BYTEA,
    "imageMime" TEXT,
    "imageVersion" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "audience" "AdAudience" NOT NULL DEFAULT 'ALL',
    "companyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slots" JSONB NOT NULL DEFAULT '[]',
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Advertisement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Advertisement_active_idx" ON "Advertisement"("active");
