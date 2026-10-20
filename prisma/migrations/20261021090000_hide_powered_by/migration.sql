-- Platform admins can hide the "Powered by Flo X Integrations" footer text per company.
ALTER TABLE "CompanySettings" ADD COLUMN "hidePoweredBy" BOOLEAN NOT NULL DEFAULT false;
