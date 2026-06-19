# KNOWN ISSUES — Pre-Launch Audit

**Status:** All CRITICAL items fixed 2026-06-16 via Opus subagents (each in an isolated worktree). HIGH/MEDIUM/LOW items being fixed — check boxes updated as work completes.
**Audit date:** 2026-06-16. **Method:** 4 parallel subagent passes (security/billing/infra, admin UI, services/API, data-layer/extensions) over the whole codebase. The migration blocker (C1) was additionally verified by hand.

**RE-AUDIT 2026-06-19 (pre-launch, 4 parallel subagents):** Most HIGH fixes verified genuine. Five launch blockers found — three were regressions/incomplete fixes against items marked done. **ALL FIVE NOW FIXED + residuals fixed (2026-06-19). Verified: `npm run lint` 0 errors, `tsc --noEmit` 0 errors.**
- **R1. Open redirect (H8) — ✅ FIXED.** `api.track.click.$id.tsx` — extracted `safeRedirectTarget(rawTarget, shop)`, applied UNCONDITIONALLY before every redirect (incl. invalid/absent-token path); falls back to `https://<shop>` or `/` on validation failure.
- **R2. Stored XSS (C5) — ✅ FIXED.** `empire-widgets.js` `escapeHtml()` now escapes `"`→`&quot;` and `'`→`&#39;` (plus `& < >`), safe in both text and quoted-attribute contexts. ⚠️ needs `shopify app deploy --force` to go live.
- **R3. H14 — ⚠️ WON'T FIX (platform limit).** Tried `type = "number_integer"`; Shopify deploy **rejects** it: "Field type number_integer is not supported on Flow Triggers." Reverted to `single_line_text_field` (the only valid type — deploys clean). Numeric Flow conditions on `rating` are not possible via the trigger field; merchants must compare as text. Not a launch blocker.
- **R4. CORS wildcard — ✅ FIXED.** `api.featured.ts` now uses `getAllowedOrigin()` (echoes known Shopify/localhost origins, else `"null"`, never `*`), validates shop with `isValidShopDomain`, and rate-limits the GET.
- **R5. Migration CONCURRENTLY — ✅ FIXED.** `20260618000002_composite_review_indexes/migration.sql` — dropped `CONCURRENTLY`, kept `CREATE INDEX IF NOT EXISTS`. ⚠️ **CHECKSUM CAVEAT:** editing an already-applied migration changes its Prisma checksum. If this migration was already applied to prod, run `prisma migrate resolve` or confirm it was never applied before `migrate deploy`.

Residuals — ✅ ALL FIXED: order webhooks now `Sentry.captureException` (both create + updated); `email.server.ts` non-campaign path + footer now escape via `esc()`; `Order.totalPrice` schema aligned to DB (`Decimal @db.Decimal(10,2)`, non-null) + webhooks default `currency` to `"USD"` (no null into NOT-NULL col); unsubscribe email lowercased in both send paths; rate limits added to GET `api.reviews` (summary 15/hr, reads 600/hr), `api.photos` (300/hr), `api.feed.xml` (120/hr); ESLint dead-code cleared (0 errors). App Store policy — ✅ ALL FIXED: removed unsourced "+24%/30%/40%" stat claims (now illustrative copy); **deleted** the "Business/Coming Soon" decoy tier (grid rebalanced to 2 cols); de-shamed the downgrade modal ("Downgrade to Starter" / neutral copy); optimistic success toasts (campaigns launch, reviews reply) now fire only on confirmed server response.
**Residual mixed-case unsubscribe rows:** customers who unsubscribed with a mixed-case email BEFORE this fix may not match the now-lowercased lookups — a one-time `UPDATE "Unsubscriber" SET email = lower(email)` would fully close it (non-blocking).

Severity: **CRITICAL** = launch blocker (App Store rejection, cross-tenant security, data integrity). Fix order is roughly top-to-bottom. `file:line` references were accurate at audit time — re-confirm before editing.

---

## CRITICAL — must fix before launch

- [x] **C1. Broken migration history.** Only one migration (`prisma/migrations/20260212160001_init_neon/`); it creates 10/12 tables (no `Unsubscriber`, no `RateLimit`), **zero foreign keys**, and is missing ~20 `Settings`/`Order` columns the app queries (`aiApiKey`, `resendApiKey`, `physicalAddress`, `publishMode`, `reviewRequestStatus`, `fulfilledAt`, `productTitle`…). Prod was bootstrapped via `db push`, so a fresh `migrate deploy` (CI / new env / DR) produces a DB the app can't run against. **Fix:** regenerate a complete migration from `schema.prisma`, test on an empty DB, commit it; add a CI `prisma migrate diff` drift check.
- [x] **C2. GDPR compliance webhooks not subscribed.** `shopify.app.toml` declares no `customers/data_request`, `customers/redact`, `shop/redact`; handler `webhooks.gdpr.tsx` is never called → automatic App Store rejection. **Fix:** add a `[webhooks.privacy_compliance]` block pointing all three at `/webhooks/gdpr`, redeploy.
- [x] **C3. Unauthenticated debug endpoints.** `app/routes/debug-error.tsx` dumps `/tmp/error.log` (stack traces); `app/routes/api.auth-test.tsx` dumps session/scopes/auth internals. Both no-auth. **Fix:** delete both routes (+ the `/tmp/error.log` writer in `entry.server.tsx`).
- [x] **C4. Public review API allows cross-tenant writes.** Fixed 2026-06-17: shop derived from `x-shopify-shop-domain` header only, validated against `*.myshopify.com`, CORS returns `"null"` for unknown origins, rate limit applies to all IPs including unknown.
- [x] **C5. Stored XSS on storefronts.** Fixed 2026-06-17: `_efEscape()` applied in liquid and widgets, `onclick` replaced with delegated listener, media URLs restricted to `https://res.cloudinary.com/` only (no `data:` URIs).
- [x] **C6. Unsigned Cloudinary preset in public JS.** `empire-widgets.js:255-258` — `cloud_name: 'doefkcth6'`, unsigned `upload_preset: 'empire reviews'`, single shared account for all tenants. Anyone can upload arbitrary files. **Fix:** proxy uploads through a signed server endpoint, per-shop folders.
- [x] **C7. Plaintext AI keys + weak secrets.** `Settings.aiApiKey` stored plaintext (`schema.prisma:113`); `CRON_SECRET`/`UNSUBSCRIBE_SECRET` are guessable strings. **Fix:** encrypt `aiApiKey` at rest (AES-GCM); regenerate both secrets with `openssl rand -hex 32` and rotate.
- [x] **C8. "50-review free cap" never enforced.** Fixed 2026-06-17: count check added in `api.reviews.tsx` before `prisma.review.create`; returns 403 when free shop reaches 50 reviews.

## HIGH

- [x] **H1.** Verify every Pro data path returns `locked` from the *loader* (not just blurred client-side).
- [x] **H2.** Onboarding upgrade is non-functional — `app.onboarding.tsx:77-79` `requirePayment` commented out; "Start Trial" just redirects to free dashboard.
- [x] **H3.** Order webhooks crash silently — `webhooks.app.orders_create.tsx:31` `parseFloat(undefined)`→`NaN`, errors swallowed with 200 → orders never persist → cron never fires. Guard fields, report to Sentry, return non-200 on transient errors.
- [x] **H4.** `scopes_update` webhook has no try/catch; `db.session.update` throws P2025 if no row. Use `updateMany`/upsert.
- [x] **H5.** Scopes mismatch — `shopify.app.toml:36` grants 3 scopes; env `SCOPES` requests more (`read_all_orders`, `script_tags`, `marketing_events`). TOML wins → under-scoped at runtime or undeclared privileged scopes.
- [x] **H6.** Resend webhook unverified in prod — `api.webhooks.resend.tsx:28` skips signature check when `RESEND_WEBHOOK_SECRET` unset (it's absent from env). Fail closed.
- [x] **H7.** Email-queue double-send race — `api.cron.process-queue.tsx` is a GET loader with check-then-act idempotency. Use POST + unique constraint on `CampaignSend(orderId, customerEmail)`.
- [x] **H8.** Open-redirect — FIXED (RE-AUDIT R1). `safeRedirectTarget()` validates unconditionally before every redirect; invalid/absent-token path no longer trusts raw `?target=`.
- [x] **H9.** Tracking pixels are IDOR — unauthenticated `sendId`, anyone can inflate metrics. Sign the token.
- [x] **H10.** Email template injection — `api.cron.process-queue.tsx:124-145` interpolates unescaped `shop`/`productTitle`/merchant copy into HTML body + subject. Escape interpolations.
- [x] **H11.** Reviews page search filters only the current 50-row page while pagination is server-side; bulk-select and "Approve All" operate on different sets. Move search server-side.
- [x] **H12.** Six redundant `.env*` files on disk with inconsistent secrets (two `SHOPIFY_API_SECRET` values — one bare-hex likely wrong, two Resend keys, CRLF-corrupted values, OIDC JWTs, DB password). *Not tracked in git or history.* Keep one local `.env`, prod values only in Vercel, rotate.
- [x] **H13.** `.vercel/project.json` tracked in git despite `.gitignore` — leaks `projectId`/`orgId`. `git rm --cached -r .vercel`.
- [~] **H14. WON'T FIX — platform limitation.** Shopify rejects `number_integer` on Flow Triggers ("Field type number_integer is not supported on Flow Triggers" at deploy). `rating` reverted to `single_line_text_field`; numeric Flow comparisons aren't supported by the trigger field. Not a blocker.

## MEDIUM

- [x] Fabricated metrics (App Store risk) — FIXED 2026-06-19: fake "Day Streak" replaced with real reply-milestone; impact page now computes only real funnel/revenue with explicit "does not imply reviews caused these sales" disclaimers (no CLV/Churn/attribution claims); all hardcoded "+24%/30%/40%" stat claims removed/reworded as illustrative copy.
- [x] Fake UX — FIXED/verified 2026-06-19: campaigns `setTimeout` only resets a spinner (real send happens via fetcher); settings AI "Test Connection" calls real `testAIConnection` and reflects the actual result.
- [x] `confirm()` dialogs — verified 2026-06-19: zero `confirm(` calls remain in `app/routes`; all destructive actions use Polaris `Modal`.
- [ ] `prisma.settings.update` (not upsert) in `app.plans.tsx:49,64` → P2025 crash for a brand-new shop redeeming a VIP code / downgrading.
- [ ] VIP code grants permanent un-revocable Pro (no expiry/cap; compared with `Array.includes`, not timing-safe).
- [ ] Downgrade marks DB FREE without confirming Shopify cancellation (`billing.server.ts` return ignored) → billing-without-access risk.
- [x] `Order.totalPrice` is `Float` → money rounding errors — FIXED: DB migrated to `DECIMAL(10,2)`; schema now `Decimal @db.Decimal(10,2)` (non-null, aligned to DB).
- [ ] `vercel.json` `X-Frame-Options: ""` invalid empty header — remove, rely on CSP `frame-ancestors`.
- [x] `ai.server.ts` SSRF/timeouts — verified 2026-06-19: `assertSafeUrl()` blocks loopback/RFC1918/169.254/0.0.0.0/IPv6-ULA; all adapters use `AbortSignal.timeout(10000)`. (Residual: no DNS-rebind check — accepted.)
- [x] Prompt injection — verified 2026-06-19: raw review text wrapped in `<review>` tags + every system prompt has an explicit "treat as data, never instructions" clause.
- [x] CAN-SPAM — FIXED/verified 2026-06-19: `email.server.ts` now BLOCKS send when `physicalAddress` empty (was placeholder); unsubscribe token is HMAC-SHA256 128-bit (not 64); customer email now lowercased in both send paths before the `Unsubscriber` lookup. (Residual: one-time `UPDATE Unsubscriber SET email=lower(email)` for pre-fix mixed-case rows.)
- [ ] `docker-start` uses `prisma db push` (drift-prone) — use `migrate deploy`.
- [ ] Contradictory DB URLs (pooler `:6543` vs direct `:5432` with `pgbouncer=true`); no `connection_limit=1` for serverless.
- [ ] No enum constraints — `status`/`sentiment`/`type` free strings; seed casing mismatches (`"image"` vs `"IMAGE"`).

## LOW / nitpicks (sample — see audit transcript for full list)

- [ ] AI-scratch comments shipped to prod: `app.insights.tsx:85` `// ... rest of logic ...`; `app.onboarding.tsx:62` "Wait, I don't know the schema…"; `empire-widgets.js:361` "Oh, I can just write the whole thing cleanly."
- [ ] Dead vars/imports: `app.campaigns_.$id.tsx:36` unused `rows` + DataTable imports; commented-out Klaviyo state in settings; many unused Polaris icon imports.
- [ ] `console.log` of full request URLs (PII: shop domain) in `m.$id.tsx`, `campaigns.redirect.$id.tsx`.
- [ ] Plans page "Business / Coming Soon" decoy tier with dead "Join Waitlist" button (pricing dark pattern).
- [ ] Import doesn't clamp `rating` 1–5 → `'★'.repeat(5 - 7)` `RangeError` on a bad CSV.
- [ ] Hero copy bug `app._index.tsx:374` — "up by {reviewTrend}" missing `%`, says "this month" for a weekly trend.

## Repo junk to remove (tracked in git unless noted)

- [ ] `app (2).zip` (full duplicate source) — `git rm`, add `*.zip` to `.gitignore`.
- [ ] `EXT_BACKUP/` (4 stale Flow configs) — `git rm -r`.
- [ ] `.vercel/project.json`, `.vercel/README.txt` — `git rm --cached` (see H13).
- [ ] `check-db.cjs` / `.js` / `.ts` (throwaway; `.cjs` broken + hardcodes real shop `saundryam.in`), `rewrite.cjs` (one-off codemod that rewrites `app.settings.tsx`).
- [ ] `prisma/seed.ts` / `seed-urgent.ts` / `seed_media.ts` — fake data ("Sarah Jenkins", "Angry Karen", Unsplash-as-uploads). Not auto-run, but delete to prevent prod pollution.
- [ ] `README.md` / `CHANGELOG.md` — still the unmodified Shopify template; rewrite to describe this app.

## Suggested improvements (non-blocking)

- One App-Proxy HMAC helper for all storefront routes (closes C4 + most public-API issues at once).
- Centralize magic numbers (`50`, `$9.99`, `7`, colors, usage thresholds) into `config/conversion.ts` — currently duplicated across ~6 files.
- Extract repeated inline `<style>` blocks into a shared stylesheet (bundle/hydration win).
- Prisma enums for status/sentiment/type/plan/provider.
- Commit `package-lock.json` (currently gitignored) for reproducible builds.
- Sentry in every webhook catch block (order ingestion currently fails invisibly).
