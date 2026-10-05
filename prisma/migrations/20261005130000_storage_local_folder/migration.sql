-- Storage option: save a company's attached/generated files to a folder on the
-- server Apollo X runs on (Platform > Companies > [company] > Storage location).
ALTER TYPE "StorageProviderType" ADD VALUE IF NOT EXISTS 'LOCAL_FOLDER';
ALTER TABLE "CompanySettings" ADD COLUMN "storageLocalPath" TEXT;
