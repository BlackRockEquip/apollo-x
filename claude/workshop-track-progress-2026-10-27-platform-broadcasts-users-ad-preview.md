# Platform admin: Broadcasts, Platform Users grouped by company, Advertising preview (2026-10-27)

Follow-up to the platform admin mockup (Design canvas "Flo X Platform Admin"). The user liked it and asked for three changes, then "build it".

## What was built

### 1. Platform Users grouped by company
- `listPlatformUsers` (lib/platform/admin-service.ts) now returns `companies: { companyId, name, code, role }[]` per user (one entry per active membership) and its search also matches a company name or code.
- `PlatformUsersWorkspace.tsx`: "By company" (default) and "Flat list" views. Groups are collapsible, Flo X staff (people with no company) first, then companies A to Z. Expand all / Collapse all. Typing a search opens every group. A person in two companies appears in both. The inline editor (profile, roles) works in either view.

### 2. Broadcasts (Platform > Broadcasts)
- Schema: `PlatformBroadcast` model, enums `PlatformBroadcastKind` (INFORMATION / IMPORTANT / MAINTENANCE) and `PlatformBroadcastAudience` (ALL / COMPANIES / USERS), `NotificationType.PLATFORM_BROADCAST`, `Notification.broadcastId`. Migration `20261027140000_platform_broadcasts`.
- `lib/platform/broadcast-model.ts` (pure rules and row types, tested), `lib/platform/broadcasts-service.ts` (list, create, withdraw, user search, delivery).
- Delivery: one PLATFORM_BROADCAST Notification per ACTIVE membership of an ACTIVE company (suspended / closed companies and inactive users skipped). A person in two companies gets it in both. "Send now" delivers inside the request. A scheduled one is delivered by `deliverDueBroadcasts()` the first time any browser polls the banner (or the platform list loads) after its start time; throttled to one check per 15 s per server process. Delivery is claimed by stamping `deliveredAt` so two browsers cannot double-send.
- Email copy (optional): sent one by one through `sendPlatformEmail` in the background; `emailedCount` records how many went. The checkbox is disabled when the platform mail server is not set up.
- Company side: `getActiveBroadcast` (notifications/service.ts) now returns the newest unread ORG_BROADCAST or PLATFORM_BROADCAST, skipping withdrawn or expired platform ones, with `kind`, `requireAck`, `link`. `BroadcastBanner.tsx` colours it by kind, shows "More" for a link and an "I have read this" button when acknowledgement was asked for. Org Admin broadcasts look as before.
- Withdraw: stamps `withdrawnAt`; unread notifications are marked read and moved to History so the bell count drops. Read rate = notifications read / recipients.
- Routes: GET/POST `/api/v1/platform/broadcasts`, GET `/api/v1/platform/broadcasts/users?q=` or `?role=`, POST `/api/v1/platform/broadcasts/[id]/withdraw`. Page `/platform/broadcasts`; sidebar item added in `PlatformShell.tsx`. Permission: PLATFORM_CONFIGURATION_MANAGE, platform context only (same as Advertising). Audit events PLATFORM_BROADCAST_CREATED / _WITHDRAWN.
- Error `BROADCAST_NO_RECIPIENTS` mapped to a 400 in lib/http/errors.ts.
- Test: `tests/unit/platform-broadcast-model.test.ts` (11 tests).

### 3. Advertising preview of saved ads
- `AdvertisingWorkspace.tsx`: an eye button on every ad in the list opens a read-only dialog with the real `SupplierAdCard` in a sidebar frame, who it is shown to (all companies, or the chosen ones by name), its timeslots in plain words (for example "Mon-Fri 08:00-17:00, 1 Nov to 30 Nov"), status, views / clicks / click rate and the link. "Edit this ad" jumps into the editor. Esc or a click outside closes it.

## Decisions and limits
- Broadcasts do not take a role filter ("administrators only"); use "Specific users" with Quick add by role instead.
- Users audience resolves to every active membership of the chosen people, so a person in two companies sees it in both.
- The scheduled-delivery check runs only while someone's browser is open on the app; a message scheduled for 03:00 appears for the first person who loads a page after that.
- Not run against a database: Prisma client could not be regenerated in the sandbox, so the Prisma-typed code was reviewed by hand. Render's build is the first real type check.

## Deploy
Run `push\push-platform-broadcasts-users-ad-preview.ps1`. HAS A MIGRATION (`20261027140000_platform_broadcasts`). It sorts after `20261027130000_rfq_quote_line_lead_time`, and `git add -A` carries that earlier work too if it has not been pushed.
