# Public live demo (view only, no login)

Added 2026-10-29. A separate copy of the app that anyone can open without a login, filled with the
"Test Demo Workshop" sample data. Visitors can click through every screen, open jobs, switch between
roles (Company admin, Manager, Sales, Store controller, Finance, Mechanic) and print or download
documents, but nothing they do is saved: saving, uploading, emailing and deleting are switched off.

Target address: **https://demo.floxintegrations.co.za**

## How it works

| Piece | What it does |
| --- | --- |
| `DEMO_MODE=true` | The one switch. Set only on the demo service, never on `apollox-staging` (the live app). |
| `src/proxy.ts` | In demo mode, refuses every POST/PUT/PATCH/DELETE (saves, uploads, emails, deletes, sign-out) with a 403 before any route runs. Sends `/login`, `/reset-password` and `/platform` back into the demo. Adds `X-Robots-Tag: noindex`. |
| `src/lib/prisma.ts` | Second safety net: in demo mode the database client refuses every write except sign-in sessions, including raw SQL. |
| `src/app/demo/route.ts` | `/demo` signs the visitor in as the demo Company admin. `/demo?as=mechanic` (or manager, sales, stores, finance) shows another role. `/demo?next=/jobs` lands on that page. Returns 404 when demo mode is off. |
| `src/components/DemoBanner.tsx` | The "Live demo" strip on every page: view-only notice, "Viewing as" role picker, "Request a demo" button. Shows a short note when a visitor tries to save. |
| `scripts/seed-demo-company.ts` | Builds the sample data. Runs on every deploy of the demo service with `DEMO_SEEDING=1` (which lets the seed write). |

Safety checks built in:
- `/demo` refuses to open if the database contains **any company other than the demo company**, so the
  demo can never be pointed at the live database by mistake.
- `/demo` is limited to 40 visits per 15 minutes per visitor (re-uses the sign-in limiter table).
- Support, Change password and Sign out are hidden in the demo.

## One-time setup on Render

1. **Push** this change (`push/push-demo-site.ps1`). The live app is not affected: demo mode is off there.
2. **New > PostgreSQL**
   - Name `apollox-demo-db`, region **Oregon** (same as staging), Postgres 17.
   - Plan: the smallest paid plan. (A free Render database is deleted after 30 days.)
3. **New > Web Service**, connect the same GitHub repo (`BlackRockEquip/apollo-x`), branch `main`.
   - Name `apollox-demo`, runtime Node, region Oregon.
   - Plan: **Starter** recommended, so the demo never "sleeps" (free plan takes about a minute to wake up for the first visitor).
   - Build command:
     ```
     npm ci --include=dev && npx prisma generate && npx prisma migrate deploy && DEMO_SEEDING=1 npx tsx scripts/seed-demo-company.ts --reset && npm run build
     ```
   - Start command: `npx next start -p $PORT`
   - Health check path: `/api/v1/health`
   - Environment variables:

     | Key | Value |
     | --- | --- |
     | `NODE_ENV` | `production` |
     | `DATABASE_URL` | the **Internal Database URL of `apollox-demo-db`** (never the staging one) |
     | `DEMO_MODE` | `true` |
     | `SESSION_COOKIE_SECURE` | `true` |
     | `APP_BASE_URL` | `https://demo.floxintegrations.co.za` |
     | `DEMO_CTA_URL` | where "Request a demo" goes, e.g. `https://www.floxintegrations.co.za/#contact` |

     Do **not** add `BOOTSTRAP_PLATFORM_*`, SMTP or storage settings. The demo needs none of them.
4. **Custom domain**: on `apollox-demo` > Settings > Custom Domains add `demo.floxintegrations.co.za`.
   At Afrihost DNS add a **CNAME** `demo` -> `apollox-demo.onrender.com` (keep the TTL low, e.g. 300).
5. Open https://demo.floxintegrations.co.za: you should land on the dashboard with the "Live demo" strip.
6. Point a "Try the live demo" button on the landing page (`BlackRockEquip/landing`) at that address.

## Keeping the data fresh

Every deploy of `apollox-demo` wipes and rebuilds the sample data, so dates ("received 3 days ago",
ETAs) stay current. It redeploys automatically whenever `main` is pushed. To refresh it on its own, use
**Manual Deploy > Deploy latest commit** on the service (or a Render deploy hook on a weekly schedule).

## Later: letting visitors try changes

Today the demo is view only. A later step could give each visitor their own private copy of the demo
company (Platform company clone) that is deleted after a day, so they can create jobs and upload files
without anyone else seeing it.
