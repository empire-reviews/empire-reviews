# KNOWN ISSUES — Pre-Launch Audit

**Status:** All CRITICAL items fixed 2026-06-16 via Opus subagents (each in an isolated worktree). HIGH/MEDIUM/LOW items being fixed — check boxes updated as work completes.
**Audit date:** 2026-06-16. **Method:** 4 parallel subagent passes (security/billing/infra, admin UI, services/API, data-layer/extensions) over the whole codebase. The migration blocker (C1) was additionally verified by hand.

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

- [ ] **H1.** Verify every Pro data path returns `locked` from the *loader* (not just blurred client-side).
- [ ] **H2.** Onboarding upgrade is non-functional — `app.onboarding.tsx:77-79` `requirePayment` commented out; "Start Trial" just redirects to free dashboard.
- [ ] **H3.** Order webhooks crash silently — `webhooks.app.orders_create.tsx:31` `parseFloat(undefined)`→`NaN`, errors swallowed with 200 → orders never persist → cron never fires. Guard fields, report to Sentry, return non-200 on transient errors.
- [ ] **H4.** `scopes_update` webhook has no try/catch; `db.session.update` throws P2025 if no row. Use `updateMany`/upsert.
- [ ] **H5.** Scopes mismatch — `shopify.app.toml:36` grants 3 scopes; env `SCOPES` requests more (`read_all_orders`, `script_tags`, `marketing_events`). TOML wins → under-scoped at runtime or undeclared privileged scopes.
- [ ] **H6.** Resend webhook unverified in prod — `api.webhooks.resend.tsx:28` skips signature check when `RESEND_WEBHOOK_SECRET` unset (it's absent from env). Fail closed.
- [ ] **H7.** Email-queue double-send race — `api.cron.process-queue.tsx` is a GET loader with check-then-act idempotency. Use POST + unique constraint on `CampaignSend(orderId, customerEmail)`.
- [ ] **H8.** Open-redirect — `api.track.click.$id.tsx:24` uses `hostname.includes(shop)`; `shop.myshopify.com.evil.com` passes. Use exact/suffix match.
- [ ] **H9.** Tracking pixels are IDOR — unauthenticated `sendId`, anyone can inflate metrics. Sign the token.
- [ ] **H10.** Email template injection — `api.cron.process-queue.tsx:124-145` interpolates unescaped `shop`/`productTitle`/merchant copy into HTML body + subject. Escape interpolations.
- [ ] **H11.** Reviews page search filters only the current 50-row page while pagination is server-side; bulk-select and "Approve All" operate on different sets. Move search server-side.
- [ ] **H12.** Six redundant `.env*` files on disk with inconsistent secrets (two `SHOPIFY_API_SECRET` values — one bare-hex likely wrong, two Resend keys, CRLF-corrupted values, OIDC JWTs, DB password). *Not tracked in git or history.* Keep one local `.env`, prod values only in Vercel, rotate.
- [ ] **H13.** `.vercel/project.json` tracked in git despite `.gitignore` — leaks `projectId`/`orgId`. `git rm --cached -r .vercel`.
- [ ] **H14.** Flow trigger `rating` typed `single_line_text_field` — merchant Flow conditions like `rating < 3` compare strings. Use `number_integer` (`extensions/empire-review-trigger/shopify.extension.toml`).

## MEDIUM

- [ ] Fabricated metrics (App Store risk): `app.reviews.tsx:228` fake "🔥 Day Streak" (always ≥3, comment says "Fake Streak Logic"); dashboard "Revenue affected by reviews" = `SUM(all orders)` with no review link; impact page advertises Revenue Attribution/CLV/Churn it doesn't compute; hardcoded "+24%/30%/40%" stat claims.
- [ ] Fake UX: `app.campaigns.tsx:276` artificial 1.5s `setTimeout`; `app.settings.tsx:604` AI "Test Connection" reports success on a 4s timer regardless of result.
- [ ] `confirm()` dialogs in embedded iframe (`app.campaigns.tsx:344,444`) — unreliable; use Polaris `Modal`.
- [ ] `prisma.settings.update` (not upsert) in `app.plans.tsx:49,64` → P2025 crash for a brand-new shop redeeming a VIP code / downgrading.
- [ ] VIP code grants permanent un-revocable Pro (no expiry/cap; compared with `Array.includes`, not timing-safe).
- [ ] Downgrade marks DB FREE without confirming Shopify cancellation (`billing.server.ts` return ignored) → billing-without-access risk.
- [ ] `Order.totalPrice` is `Float` → money rounding errors. Use `Decimal`.
- [ ] `vercel.json` `X-Frame-Options: ""` invalid empty header — remove, rely on CSP `frame-ancestors`.
- [ ] `ai.server.ts` no fetch timeouts; Ollama endpoint merchant-controlled → SSRF (can hit `169.254.169.254`). Add `AbortSignal.timeout`, block private IPs.
- [ ] Prompt injection — raw review text interpolated into AI prompts (`ai.server.ts:203,251`).
- [ ] CAN-SPAM — `email.server.ts` sends with a placeholder when `physicalAddress` empty instead of blocking; unsubscribe token truncated to 64 bits, email not lowercased.
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
