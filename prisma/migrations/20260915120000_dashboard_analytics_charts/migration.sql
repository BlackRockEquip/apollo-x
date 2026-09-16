-- Dashboard analytics line graphs (2026-09-15, user request: "add a
-- linegraph that is customizable for different analytics eg: total jobs
-- per month, total completed jobs, warrantys per month etc, user can
-- select 3 line graph views"). Up to 3 chosen metric keys per user, stored
-- the same way `widgets` already is on this table — nullable/absent for a
-- user who hasn't customized it yet, so a sensible default (computed in
-- code) is used until they do.
ALTER TABLE "UserDashboardConfig" ADD COLUMN "analyticsCharts" JSONB;
