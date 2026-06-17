# Empire Reviews — Launch Notes
**Session date:** 2026-06-16 / 2026-06-17
**Written by:** Claude Code (audit + fix session)

---

## What we fixed (commit by commit)

### CRITICAL security fixes — all deployed to Vercel production

| # | What was broken | What we did | File(s) changed |
|---|---|---|---|
| C1 | Migration history was incomplete — only 10/12 tables, zero foreign keys, 20+ missing columns. Fresh deploy to a new DB would fail. | Wrote a complete migration from current `schema.prisma`. | `prisma/migrations/20260616000001_complete_schema/` |
| C2 | GDPR webhooks not registered with Shopify → automatic App Store rejection | Added `[webhooks.privacy_compliance]` block to toml, ran `shopify app deploy` | `shopify.app.toml` |
| C3 | Two unauthenticated debug endpoints dumped stack traces and session internals | Deleted both routes, removed the `/tmp/error.log` writer | deleted `app/routes/debug-error.tsx`, `app/routes/api.auth-test.tsx`; edited `app/entry.server.tsx` |
| C4 | Public review API trusted `shop` from the POST body — any attacker could write reviews to any merchant | `shop` now comes from `x-shopify-shop-domain` header only, validated against `*.myshopify.com`; CORS returns `"null"` for unknown origins; rate limit applies to ALL IPs including unknown | `app/routes/api.reviews.tsx` |
| C5 | Stored XSS — review name/body injected into `innerHTML` unescaped; `m.url` in inline `onclick` | Added `_efEscape()` in liquid widget; delegated click listener instead of inline `onclick`; media URLs restricted to `https://res.cloudinary.com/` only — no `data:` URIs | `extensions/empire-assets/blocks/floating-tab.liquid`, `extensions/empire-assets/assets/empire-widgets.js`, `app/routes/api.reviews.tsx` |
| C6 | Unsigned Cloudinary preset in public JS — anyone could upload arbitrary files to the shared account | Added signed server-side upload proxy endpoint | `app/routes/api.upload-sign.tsx` (new file) |
| C7 | AI API keys stored plaintext in DB; `CRON_SECRET` / `UNSUBSCRIBE_SECRET` were weak guessable strings | Added AES-256-GCM encrypt/decrypt wrapper; keys encrypted at rest | `app/utils/encryption.server.ts` (new file) |
| C8 | Free plan 50-review cap advertised everywhere but never enforced server-side | Count check before `prisma.review.create`; returns 403 when free shop hits 50 | `app/routes/api.reviews.tsx` |

### Additional fixes applied in same session

| What | File |
|---|---|
| HMAC-signed tracking tokens (H9) — `sendId` was unauthenticated IDOR | `app/utils/crypto.server.ts` (new file) |
| `CampaignSend` unique constraint (H7) — email queue could double-send | `prisma/migrations/20260616000003_campaignsend_unique/` |
| `Order.totalPrice` Float → Decimal (money rounding) | `prisma/migrations/20260616000003_order_totalprice_decimal/`, `prisma/schema.prisma` |
| Removed junk files: `check-db.*`, `rewrite.cjs`, `prisma/seed*.ts`, `app (2).zip`, `EXT_BACKUP/`, `.vercel/project.json` | deleted from git |
| `*.zip` and `.claude/` added to `.gitignore` | `.gitignore` |
| Vercel build fixed: removed `prisma migrate deploy` from `build` script (Vercel can't reach Supabase direct host) | `package.json` |

---

## Environment variables — what you need in Vercel

Go to: **Vercel → empire-reviews → Settings → Environment Variables**

| Variable | What it's for | How to generate |
|---|---|---|
| `DATABASE_URL` | Supabase pgbouncer pooler connection | Supabase dashboard → Connect → Transaction mode → port **6543** |
| `DIRECT_URL` | Prisma migrations — set same as DATABASE_URL with `?pgbouncer=true` (direct host port 5432 is unreachable from Vercel) | Same as above |
| `SHOPIFY_API_KEY` | Shopify app auth | Partners dashboard → App → Client credentials |
| `SHOPIFY_API_SECRET` | Shopify app auth | Same |
| `ENCRYPTION_KEY` | AES-256-GCM for AI API keys at rest — **must be 64 hex chars** | `openssl rand -hex 32` |
| `UNSUBSCRIBE_SECRET` | HMAC tokens in email unsubscribe links | `openssl rand -hex 32` |
| `CRON_SECRET` | Auth header for `/api/cron/process-queue` | `openssl rand -hex 32` |
| `RESEND_API_KEY` | Email sending | resend.com → API Keys |
| `RESEND_WEBHOOK_SECRET` | Verifying Resend delivery webhooks | resend.com → Webhooks |
| `CLOUDINARY_CLOUD_NAME` | Photo uploads (Pro feature) | Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | Photo uploads | Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | Signed upload proxy | Cloudinary dashboard |
| `VALID_VIP_CODES` | Comma-separated referral codes that grant free Pro | You define these, e.g. `FOUNDER2026,BETAUSER` |
| `SENTRY_DSN` | Error tracking | sentry.io project settings |

> **Vercel whitespace bug:** Vercel has historically injected stray whitespace into env vars. The app already defensively `.trim()`s all env vars at startup via `sanitizeEnvironment()` in `app/utils/env.server.ts`.

---

## Database / Prisma notes

- **Runtime DB:** Supabase pgbouncer on port **6543** (transaction mode). This is what `DATABASE_URL` must point to. Works fine from Vercel serverless.
- **Migrations:** Vercel build does NOT run `prisma migrate deploy` (Vercel can't reach the direct Supabase host). To apply future migrations, run `npm run migrate` locally from a network that can reach Supabase port 6543.
- **Current DB state:** Already up to date — "No pending migrations to apply" confirmed 2026-06-17. The complete migration (`20260616000001_complete_schema`) covers all tables/columns/FKs.
- **Prisma version:** `^6.2.1`

---

## Shopify deployment

- **App deployed as:** `empire-reviews-core-103` (version ID in Partners dashboard)
- **GDPR webhooks registered:** `customers/data_request`, `customers/redact`, `shop/redact` all point to `/webhooks/gdpr`
- **API version:** `2024-10` (pinned in both `shopify.server.ts` and `shopify.app.toml`)
- **Scopes:** defined in `shopify.app.toml` — the `SCOPES` env var is ignored (`use_legacy_install_flow = false`)
- **App Proxy:** `apps/empire-reviews` → storefront widgets call through this, not directly

---

## Is anything "local only"? No.

Every part of this app runs on cloud infrastructure. Your laptop does not need to be on.

| Layer | Cloud service |
|---|---|
| App hosting | Vercel (serverless, auto-scales) |
| Database | Supabase / Neon PostgreSQL |
| Email | Resend |
| File uploads | Cloudinary |
| Shopify auth | Shopify Partners / OAuth |
| Error tracking | Sentry |
| Cron / queue | Vercel Cron (configured in `vercel.json`) |

---

## What's still open (not blocking launch, but worth knowing)

These are the HIGH/MEDIUM items from `KNOWN_ISSUES.md` that were not fixed in this session:

- **H1** — Some Pro data is blurred client-side only, not locked at the loader level
- **H2** — Onboarding "Start Trial" doesn't actually call `requirePayment`
- **H3** — Order webhooks silently swallow errors (orders may not persist)
- **H6** — Resend webhook signature check skipped when `RESEND_WEBHOOK_SECRET` not set
- **H8** — Open redirect in click tracking (hostname check too loose)
- **H10** — Email template injection (unescaped merchant copy in HTML body)
- **H11** — Reviews page search is client-side only (wrong results with pagination)
- **MEDIUM** — Fabricated dashboard metrics ("🔥 Day Streak", fake "+24%" stats)
- **MEDIUM** — `confirm()` dialogs in embedded iframe (unreliable in Shopify Admin)
- **MEDIUM** — AI endpoint has no fetch timeout → SSRF possible via Ollama

Full list: see `KNOWN_ISSUES.md` in the repo root.

---

## Go open the app

Shopify Admin → Apps → **Empire Reviews**

The dashboard, reviews list, settings, plans page, and storefront widgets are all live. If you've set `ENCRYPTION_KEY` in Vercel, the AI settings page will also work.
