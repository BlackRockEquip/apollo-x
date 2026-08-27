# Apollo X

Production foundation for the multi-tenant Apollo X operational and commercial platform.

Phase 2 adds tenant-scoped customers (branches, contacts and typed addresses), suppliers, manufacturers/brands, parts definitions, hierarchical storage locations, services, effective-dated tax, commercial terms, controlled numbering, and expanded company settings. Stock balances and movements remain intentionally deferred to Phase 3. Source mappings are documented in `docs/phase-2-reference-mapping.md`.

## Foundations included

- Global identities and database-backed revocable sessions.
- Company memberships and tenant roles.
- Separate platform roles and explicit audited support contexts.
- Protected `BLACK_ROCK_EQUIPMENT` internal tenant entitlement policy.
- External tenant module entitlements with configurable read-only grace.
- Central permission and module-access guards.
- Tenant-safe repository mutation pattern.
- Audit event model and service.
- Versioned API routes and responsive Apollo UI shell.
- Unit and optional PostgreSQL tenant-isolation integration tests.

## Local setup

1. Copy `.env.example` to `.env` and use strong local credentials.
2. Run `npm install`.
3. Run `npm run prisma:generate`.
4. Run `npm run prisma:migrate -- --name phase_1_foundation` against PostgreSQL.
5. Set secure bootstrap credentials and run `npm run seed`.
6. Run `npm run dev`.

The integration test suite requires a disposable PostgreSQL database in `DATABASE_URL_TEST` whose schema has been migrated. Never point it at production.
