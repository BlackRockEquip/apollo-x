# Apollo X platform merge — decisions and direction

Captured 2026-09-09, following a cross-comparison of Apollo X and ModApp (see `apollox-vs-modapp-comparison.md` in this project).

## The goal, restated

Not a workshop-system rebuild that happens to also carry a sports-league feature — a genuine multi-product platform. A Super Admin manages distinct "environments" (products), and organizations subscribe into whichever one fits their business: sporting councils/schools get the Sports League product, workshop-related organizations get the Workshop product. Subscription-based, per organization, per product.

## Target architecture

Apollo X's existing foundation becomes the shared platform layer for every product:

- Identity, sessions, company/tenant model, audited platform-support access, fine-grained permissions, and the entitlement system (`CompanyModuleEntitlement`, with `EntitlementSource`/`EntitlementStatus` already modelling `PLAN`/`TRIAL`/`GRACE_READ_ONLY`/etc.) all stay as-is and apply platform-wide, not just to Workshop.
- One new concept needs adding above `ModuleKey`: a **Product** (`WORKSHOP`, `SPORTS_LEAGUE`, and room for more later). An organization subscribes to one or more Products; `ModuleKey` stays as the finer-grained toggle *within* whichever Product(s) that organization has. Entitlements become effectively `(companyId, product, module)` rather than today's `(companyId, module)`.
- Ringball currently has its own parallel, bolted-on auth (`lib/leagueRbac.ts`, `lib/leagueSession.ts`, `lib/leagueScope.ts`, `/ringball-login`, `/api/ringball-auth/*`) completely separate from ModApp's main session system. That duplication goes away in the merged platform — Sports League organizations sign in through the same identity/session/entitlement layer as Workshop organizations, just landing in a different product based on subscription.

## Two tracks, not one

**Workshop** — urgent, real business runs on it today (Black Rock Equipment, via ModApp).
1. Bring Apollo X's Job model and status flows up to parity with ModApp's real-world shape: quote/SO/invoice numbers, dual delivery legs, client-vs-mechanic ETA, payment tracking, and the three distinct status-flow families (main workshop / field / parts-supply) instead of Apollo X's current single flow.
2. Job types: a small fixed enum drives *behavior* (which status-flow family, which module gate) — matching ModApp's own special-cased keys (`WARRANTY`, `FIELD`, `PEX_SUPPLY`, `PEX_RETURN`, default/main-flow). On top of that, companies can define their own named job-type presets/labels that map onto one of those fixed families, matching ModApp's per-company `JobTypeConfig` flexibility without losing type safety where it drives logic.
3. Build the modules Apollo X only has as reserved names today, in roughly this order: Quotes/RFQ (with supplier email + document extraction, matching ModApp's `RfqRequest`/`RfqQuote`/`RfqQuoteLine`), Invoicing/Payments, Documents/branding (job cards, delivery notes, pick slips — matching ModApp's `DocumentTemplate`/`printSections`), Notifications and Attachments, then Import/Export, audit-log-facing tooling, and API keys/external connections last.
4. One-time historical data migration from ModApp into Apollo X via the import path already started (`scripts/import-black-rock-history.ts`, `docs/phase-2-reference-mapping.md`), once Workshop is at real parity.
5. Single cutover for Workshop once parity is reached — ModApp keeps running unchanged for Black Rock in the meantime.

**Sports League** — separate timeline, after Workshop cutover work is underway.
1. Port Ringball's domain models (`SportingCouncil`, `RingballLeague`, `RingballDivision`, `RingballTeam`, `RingballPlayer`, `RingballGame`, `RingballCardEvent`) onto the shared Apollo X platform as the Sports League product's modules.
2. Retire Ringball's parallel auth system in favor of the shared platform identity/session/entitlement layer.
3. Cutover on its own schedule, independent of Workshop.

## Open items for later

- Confirm whether `RingballApp` (the separate sibling folder alongside ModApp) is an earlier standalone extraction, a fork, or stale — worth resolving before the Sports League track starts, so there's one clear source of truth to port from.
- The `docs/phase-2-reference-mapping.md` mapping references a "Mornay source" `ClientBranch` concept that doesn't exist in ModApp's current schema — worth clarifying before it drives the historical import.
