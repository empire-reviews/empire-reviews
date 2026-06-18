# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Empire Reviews** — a Shopify embedded app (product-review management SaaS) for Shopify merchants. Freemium: `FREE` vs `EMPIRE_PRO` ($9.99/mo, 7-day trial). Three deployable surfaces share one codebase:

1. **Admin app** — Remix routes under `app/routes/app.*.tsx`, rendered inside the Shopify Admin iframe with Polaris.
2. **Storefront theme extension** (`extensions/empire-assets/`) — Liquid blocks + `assets/empire-widgets.js` that render reviews on the merchant's storefront and POST new reviews back to the app.
3. **Flow trigger extension** (`extensions/empire-review-trigger/`) — fires a Shopify Flow event when a review is submitted.

Stack: Remix 2 + React 18 + Shopify Polaris · Prisma + PostgreSQL (Neon/Supabase pooler) · Vercel serverless (`@vercel/remix`) · Resend (email) · Sentry (`@sentry/remix`).

## Commands

```bash
npm run dev          # shopify app dev — tunnels + runs the app against a dev store
npm run build        # prisma migrate deploy && prisma generate && remix vite:build  (runs on Vercel)
npm run lint         # eslint (cached)
npm run deploy       # shopify app deploy — pushes extensions + app config to Shopify
npm run setup        # prisma generate && prisma db push  (LOCAL ONLY — see caution below)
npx prisma studio    # inspect the DB
npx prisma migrate dev --name <name>   # create a new migration after editing schema.prisma
```

There is **no test framework configured** — `lint` is the only automated check. Don't invent a `test` script; verify changes by running `dev` against a dev store.

## Critical architecture & conventions

### Billing has two intentionally-different code paths
The DB (`Settings.plan`) is the **source of truth**, not the Shopify billing API. Read `app/billing.server.ts` before touching anything plan-related.

- **`isPlanPro(shop)`** — DB-only, instant, never calls Shopify. Use this in **every content route** that gates Pro features (dashboard, insights, impact, reviews, campaigns).
- **`hasActivePayment(billing, session)`** — DB fast-path, then falls back to the Shopify billing API (5s timeout) and caches a confirmed Pro result to the DB. Use **only** in the Plans and Settings loaders that legitimately sync billing state.
- **Never demote to FREE from a billing check.** Downgrades happen only via the uninstall webhook or the explicit user "downgrade" action. A `billing.check()` timeout must never strip a VIP/referral user's access.
- **VIP referral codes** (`VALID_VIP_CODES` env, comma-separated) promote the DB to `EMPIRE_PRO` with no payment.
- The plan/trial config lives in the `shopifyApp({ billing })` block in `app/shopify.server.ts`, **not** in `requirePayment`. Managed billing (`use_legacy_install_flow = false`) honors the app-level `trialDays`.

### Scopes & app config live in `shopify.app.toml`, not env
`use_legacy_install_flow = false` means `shopify.app.toml` `access_scopes` is authoritative; the `SCOPES` env var is effectively dead. Change scopes in the TOML and `npm run deploy`. API version is pinned to `2024-10` (`ApiVersion.October24` in `shopify.server.ts` must match the TOML).

### Vercel corrupts env vars — everything is `.trim()`-ed
`shopify.server.ts`, `db.server.ts`, and `entry.server.tsx` defensively trim env vars because Vercel deploys have injected stray CRLF/whitespace. `app/utils/env.server.ts` (`sanitizeEnvironment()`) is the central version, called from `entry.server.tsx`. When adding a new secret-backed feature, trim the value at read time.

### DB resilience patterns (serverless cold starts)
- **`withRetry(fn, attempts?)`** from `db.server.ts` wraps queries that can fail on a cold Neon/Supabase connection. Session storage uses a custom `RetryablePrismaSessionStorage` that warms the connection before `ensureReady()`.
- The dashboard loader (`app._index.tsx`) runs each metric query through `withRetry` inside `Promise.allSettled`, so one DB hiccup degrades a single card instead of 500-ing the page.
- **Migrations:** the build runs `prisma migrate deploy`. Do **not** rely on `prisma db push` (`npm run setup`) for production schema — it drifts. After editing `schema.prisma`, always generate a real migration and commit it.

### Public storefront API & App Proxy
Storefront widgets call the app through the Shopify **App Proxy** (`shopify.app.toml`: subpath `empire-reviews`, prefix `apps` → `apps/empire-reviews`). The key public endpoints:
- `api.reviews.tsx` — GET lists approved reviews (JSON) for widgets; POST accepts new review submissions from the storefront. `Settings.publishMode` (`none`/`five_star`/`all`) controls auto-approval.
- `api.photos.ts`, `api.featured.ts`, `api.feed.xml.tsx` — media upload, featured carousel, Google Merchant feed.
- `api.upload-sign.tsx` — POST-only signed Cloudinary upload proxy (Pro-only). Returns SHA-1 signature params; the widget uploads directly to Cloudinary using them. Never use unsigned uploads.

**Trust boundary rules for storefront routes:**
- Always derive `shop` from the `x-shopify-shop-domain` header (set by the App Proxy, not spoofable). Fall back to `?shop=` query param for dev only.
- Always validate shop with `isValidShopDomain()` (must match `*.myshopify.com`). Return 400 otherwise.
- Never trust form fields or request body for `shop`.
- Rate limiting applies to all IPs including unknown — never skip it.

### Email automation pipeline (review requests)
`orders/*` webhooks → persist `Order` rows → cron drains the queue → Resend → tracking pixels:
1. `webhooks.app.orders_{create,fulfilled,updated}.tsx` upsert `Order` rows with `reviewRequestStatus`.
2. `api.cron.process-queue.tsx` (authorized by `Authorization: Bearer ${CRON_SECRET}`) finds due orders past `Settings.reviewRequestDelay` days, sends via `services/email.server.ts`, records `CampaignSend`.
3. `api.track.open.$id.tsx` / `api.track.click.$id.tsx` update open/click metrics; `api.unsubscribe.tsx` honors CAN-SPAM (HMAC token from `utils/crypto.server.ts`, `UNSUBSCRIBE_SECRET`).
`api.cron.tsx` and `api.keepalive.tsx` are DB keep-alive pings (Supabase idle-pause workaround), distinct from the queue processor.

### Multi-provider AI (BYOK)
`app/services/ai.server.ts` is a unified adapter over OpenAI / Gemini / Claude / DeepSeek / Groq / Ollama. Merchants supply their own key (`Settings.aiProvider` + `Settings.aiApiKey`). Used for review-reply drafting and cached dashboard "insights" (`Settings.aiInsightsSummary` — the dashboard reads the cache read-only; generation happens on the Insights page).

**`Settings.aiApiKey` is stored encrypted** (AES-256-GCM) via `app/utils/encryption.server.ts`. Always call `encrypt()` before writing to DB and `decrypt()` after reading. The `ENCRYPTION_KEY` env var must be 64 hex chars (32 bytes) — generate with `openssl rand -hex 32`.

### Conversion/analytics layer
`app/config/conversion.ts` + `app/utils/analytics.server.ts` drive install-age "conversion phases" and upgrade-prompt timing (`Session.appInstalledAt`, `lastUpgradePrompt`, `upgradePromptCount`). `AnalyticsEvent` rows track internal events. `app/lib/campaign-templates.ts` holds the email-campaign template copy (reciprocity / altruism / scarcity).

## Data model notes
- `Settings` is per-shop (`@unique shop`) and holds plan, widget theming, AI config, and email config. Many routes cast it `as any` because the Prisma client and DB schema have historically drifted — verify columns exist after schema changes.
- Cascade deletes (`ReviewMedia`/`Reply` → `Review`) are declared in `schema.prisma` and are now enforced by real FK constraints (added in migration `20260616000001_complete_schema`).
- `Unsubscriber` and `RateLimit` tables exist as of migration `20260616000001_complete_schema`.

## Pre-launch status
**All CRITICAL blockers fixed (2026-06-16).** HIGH/MEDIUM items remain — see [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md). Read it before starting any fix work and check items off as resolved.

### Security invariants established by the critical fixes — do not regress:
- **No debug routes.** Never add unauthenticated endpoints that dump logs, sessions, or internal state.
- **Storefront `shop` from header only.** `x-shopify-shop-domain` → validated → used. Never from form body.
- **Media URLs: Cloudinary HTTPS only.** `https://res.cloudinary.com/` prefix required. No `data:` URIs.
- **Cloudinary uploads: signed proxy only.** Use `api.upload-sign.tsx`; never unsigned presets.
- **`aiApiKey` always encrypted.** Use `encrypt()`/`decrypt()` from `app/utils/encryption.server.ts` at every read/write.
- **Free plan cap enforced.** 50-review limit checked in both `api.reviews.tsx` (POST) and `app.import.tsx` before any `prisma.review.create`.
- **GDPR webhooks wired.** `shopify.app.toml` has `[webhooks.privacy_compliance]` pointing all three events at `/webhooks/gdpr`.
- **All storefront dynamic output escaped.** Never use `innerHTML` with unescaped user data in `empire-widgets.js` or `.liquid` blocks.

## Repo notes
- `README.md` / `CHANGELOG.md` are the **unmodified Shopify Remix template** and do not describe this app — don't trust them.
- The root contains leftover/throwaway artifacts (`app (2).zip`, `EXT_BACKUP/`, `check-db.*`, `rewrite.cjs`, `prisma/seed*.ts` with fake data). These are not part of the running app; don't import from them.
- A user-global `~/CLAUDE.md` (Ruflo MCP/swarm config) also applies in this environment — it governs agent coordination, not this app's domain logic.

## Deployment convention — CRITICAL
**Git push alone does NOT update the storefront widgets.** Shopify serves theme extension assets (`empire-widgets.js`, `empire-widgets.css`, all `.liquid` blocks) from its own CDN. To update them you must run:
```bash
shopify app deploy --force
```
Git push → Vercel only updates the backend app routes (`app/routes/`). Always run `shopify app deploy --force` after any change to `extensions/empire-assets/`.

## Widget scoping rules (audited 2026-06-18)
All 7 theme blocks were audited for product-page vs store-wide data scoping:

| Block | Scope logic | Notes |
|---|---|---|
| `review-list.liquid` | ✅ Correct | `auto`/`product`/`store` setting; `data-product-id` → JS → API `?productId=` |
| `photo-gallery.liquid` | ✅ Correct | `filter_mode` setting; conditional Liquid → `data-product-id` → JS |
| `ai-summary.liquid` | ✅ Correct | Reads `data-product-id`, appends `?productId=` to summary API call |
| `star-rating.liquid` | ✅ Correct | Template-restricted to product pages; reads `data-product-id` |
| `floating-tab.liquid` | ✅ Fixed | Was always store-wide. Now reads `btn.dataset.productId` and scopes fetch |
| `review-carousel.liquid` | ✅ Fixed | Was always `/api/featured` (store-wide). Now: product page → `/api/reviews?productId=X`; other pages → `/api/featured` |
| `core-embed.liquid` | n/a | JS/CSS loader only |

**Pattern:** every block must pass `data-product-id="{{ product.id }}"` on its root element. JS reads it, strips `gid://shopify/Product/` prefix if present, and appends `&productId=` to API calls only when non-empty. Empty productId = store-wide.

## AI summary prompt types (`app/services/ai.server.ts`)
Three prompt modes exist — use the right one:
- **`"storefront"`** — customer-facing widget. NEVER mentions spam/fake reviews/review numbers. Warm, shopper-perspective summary. Used by `api.reviews.tsx` `intent=summary`.
- **`"quick"`** — merchant-facing dashboard insight. Flags quality issues, warns about spam, actionable for the merchant.
- **`"executive"`** — detailed markdown report with 🌟/⚠️/💡 sections. Used on the Insights page.

## Star sizing in widgets (`empire-widgets.css` / `empire-widgets.js`)
Stars use `font-size: var(--star-size, 1.15rem)` on `.empire-skeleton-star`. To resize stars, set `--star-size` as a CSS custom property on the parent `.empire-stars-wrap` element — **do not set `font-size` on the parent**, as the child class overrides inherited font-size. Example: `style="--star-size:28px;"`.

## Photo gallery hover reveal
`extensions/empire-assets/blocks/photo-gallery.liquid` + gallery JS in `empire-widgets.js`:
- Images are clean at rest; on hover a dark gradient fades in from the bottom
- `.empire-gallery-tile-badge` slides up on hover showing reviewer name (left) + `★★★★★ 5.0` (right)
- No always-visible badge overlaid on images (removed padding/pill style)
