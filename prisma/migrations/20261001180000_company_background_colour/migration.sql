-- User request: "Add a colour field to change the main background colour"
-- (alongside renaming the Primary/Accent/Secondary colour labels to Sidebar
-- Button Colour / Horizontal Bar Colour / Sidebar Background Colour — see
-- CompanySettingsForm.tsx). Same plain hex-string convention as the
-- existing themeColor/accentColor/secondaryColor columns.

ALTER TABLE "CompanySettings" ADD COLUMN "backgroundColor" TEXT;
