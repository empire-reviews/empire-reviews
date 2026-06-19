import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import type { MouseEvent } from "react";

import { login } from "../../shopify.server";

// In-page nav: scroll explicitly instead of relying on native hash navigation,
// which Remix's <ScrollRestoration> races against (the cause of links needing
// several clicks before they'd move). Delegated from the page root.
function onAnchorClick(e: MouseEvent<HTMLDivElement>) {
  const anchor = (e.target as HTMLElement).closest('a[href^="#"]');
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (!href || href === "#") return;
  const el = document.querySelector(href);
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState(null, "", href);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

function InstallForm({ showForm }: { showForm: boolean }) {
  if (!showForm) {
    return (
      <a className="er-btn er-btn-primary er-btn-lg" href="#pricing">
        See plans &amp; pricing
      </a>
    );
  }
  return (
    <Form className="er-form" method="post" action="/auth/login">
      <input
        className="er-input"
        type="text"
        name="shop"
        placeholder="your-store.myshopify.com"
        aria-label="Your Shopify store domain"
      />
      <button className="er-btn er-btn-primary" type="submit">
        Install free →
      </button>
    </Form>
  );
}

const FEATURES = [
  {
    icon: "📧",
    title: "Automated review requests",
    body:
      "Psychology-driven email campaigns fire automatically after delivery, then track every open and click — so you collect reviews on autopilot instead of chasing customers.",
  },
  {
    icon: "📸",
    title: "Photo & video reviews",
    body:
      "Go beyond star ratings. Let customers attach real photos and videos of your product in the wild — the social proof that actually converts hesitant shoppers.",
  },
  {
    icon: "🎨",
    title: "Beautiful storefront widgets",
    body:
      "Star ratings, photo galleries, carousels, an AI summary, and a floating review tab — all themeable to match your brand, all installed with no code.",
  },
  {
    icon: "🤖",
    title: "AI insights & replies",
    body:
      "Understand customer sentiment at a glance, get an executive summary of what shoppers love, and draft thoughtful replies in one click. Bring your own AI key.",
  },
  {
    icon: "🛒",
    title: "Google Shopping feed",
    body:
      "Push your verified reviews into a Google product-review feed so your star ratings show up directly in Search and Shopping results.",
  },
  {
    icon: "⚡",
    title: "Flow automation & CSV import",
    body:
      "Trigger Shopify Flow workflows the moment a review lands, and migrate your existing reviews from any platform with a single CSV import.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Install in one click",
    body: "Connect your Shopify store. No theme code, no developers, no setup fees.",
  },
  {
    n: "02",
    title: "Collect automatically",
    body: "Empire Reviews emails happy customers after each order and gathers photo & video reviews for you.",
  },
  {
    n: "03",
    title: "Convert more visitors",
    body: "Display that social proof across your storefront and let real customers do the selling.",
  },
];

const css = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');

:root {
  --ink: #070b16;
  --ink-2: #0b1120;
  --panel: rgba(255,255,255,0.035);
  --panel-2: rgba(255,255,255,0.06);
  --line: rgba(255,255,255,0.09);
  --line-2: rgba(255,255,255,0.14);
  --text: #eaf0fb;
  --muted: #98a4ba;
  --gold: #fbbf24;
  --gold-2: #f59e0b;
  --emerald: #10b981;
  --emerald-2: #059669;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 84px; }
body {
  margin: 0;
  background: var(--ink);
  color: var(--text);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.er-page {
  position: relative;
  overflow-x: clip;
  background:
    radial-gradient(900px 600px at 12% -5%, rgba(245,158,11,0.16), transparent 60%),
    radial-gradient(820px 560px at 92% 4%, rgba(16,185,129,0.14), transparent 60%),
    radial-gradient(1000px 700px at 50% 110%, rgba(99,102,241,0.10), transparent 60%),
    var(--ink);
}
.er-wrap { width: 100%; max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.er-head, .er-h2, .er-eyebrow { font-family: 'Outfit', 'Inter', sans-serif; }

/* NAV */
.er-nav {
  position: sticky; top: 0; z-index: 50;
  backdrop-filter: blur(14px);
  background: rgba(7,11,22,0.72);
  border-bottom: 1px solid var(--line);
}
.er-nav-inner { display: flex; align-items: center; justify-content: space-between; height: 68px; }
.er-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); }
.er-brand img { height: 30px; width: auto; }
.er-brand-name { font-family: 'Outfit'; font-weight: 800; font-size: 1.12rem; letter-spacing: -0.01em; }
.er-brand-name span { background: linear-gradient(90deg, var(--gold), var(--gold-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.er-nav-links { display: flex; align-items: center; gap: 30px; }
.er-nav-links a { color: var(--muted); text-decoration: none; font-size: 0.92rem; font-weight: 500; transition: color .15s; }
.er-nav-links a:hover { color: var(--text); }

/* BUTTONS */
.er-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-family: 'Outfit'; font-weight: 700; font-size: 0.95rem;
  padding: 11px 20px; border-radius: 12px; border: 1px solid transparent;
  cursor: pointer; text-decoration: none; white-space: nowrap; transition: transform .12s ease, box-shadow .2s ease, background .2s;
}
.er-btn:active { transform: translateY(1px); }
.er-btn-primary { color: #052e1d; background: linear-gradient(135deg, #34d399, var(--emerald-2)); box-shadow: 0 10px 30px -10px rgba(16,185,129,0.6); }
.er-btn-primary:hover { box-shadow: 0 14px 38px -10px rgba(16,185,129,0.75); transform: translateY(-1px); }
.er-btn-ghost { color: var(--text); background: var(--panel-2); border-color: var(--line-2); }
.er-btn-ghost:hover { background: rgba(255,255,255,0.1); }
.er-btn-lg { padding: 15px 28px; font-size: 1.02rem; border-radius: 14px; }
.er-nav .er-btn { padding: 9px 18px; }

/* HERO */
.er-hero { padding: 84px 0 64px; text-align: center; position: relative; }
.er-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 0.78rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--gold); background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.28);
  padding: 7px 14px; border-radius: 999px; margin-bottom: 26px;
}
.er-hero h1 {
  font-family: 'Outfit'; font-weight: 900; letter-spacing: -0.025em; line-height: 1.04;
  font-size: clamp(2.4rem, 6vw, 4.25rem); margin: 0 auto 22px; max-width: 16ch;
}
.er-hero h1 .grad { background: linear-gradient(100deg, var(--gold) 10%, #fde68a 45%, var(--emerald) 95%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.er-hero-sub { font-size: clamp(1.05rem, 2vw, 1.28rem); color: var(--muted); max-width: 62ch; margin: 0 auto 34px; line-height: 1.6; }
.er-trust { margin-top: 22px; color: var(--muted); font-size: 0.86rem; display: flex; flex-wrap: wrap; gap: 10px 22px; justify-content: center; }
.er-trust b { color: var(--text); font-weight: 600; }
.er-stars { color: var(--gold); letter-spacing: 2px; text-shadow: 0 0 18px rgba(251,191,36,0.55); font-size: 1.05rem; }

/* INSTALL FORM */
.er-form { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; max-width: 540px; margin: 0 auto; }
.er-input {
  flex: 1 1 280px; min-width: 240px;
  background: rgba(255,255,255,0.05); border: 1px solid var(--line-2); color: var(--text);
  padding: 13px 16px; border-radius: 12px; font-size: 0.98rem; font-family: 'Inter';
  outline: none; transition: border-color .15s, box-shadow .15s;
}
.er-input::placeholder { color: #6b7790; }
.er-input:focus { border-color: var(--emerald); box-shadow: 0 0 0 3px rgba(16,185,129,0.18); }

/* SHOWCASE STRIP */
.er-strip { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; margin-top: 56px; }
.er-chip {
  display: flex; align-items: center; gap: 9px; font-size: 0.86rem; color: var(--text);
  background: var(--panel); border: 1px solid var(--line); padding: 11px 16px; border-radius: 12px;
}
.er-chip .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--emerald); box-shadow: 0 0 10px var(--emerald); }

/* SECTIONS */
.er-section { padding: 80px 0; }
.er-section-head { text-align: center; max-width: 720px; margin: 0 auto 52px; }
.er-kicker { font-family: 'Outfit'; font-weight: 700; font-size: 0.82rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--emerald); margin-bottom: 14px; }
.er-h2 { font-weight: 800; letter-spacing: -0.02em; font-size: clamp(1.9rem, 4vw, 2.9rem); margin: 0 0 16px; line-height: 1.1; }
.er-lead { color: var(--muted); font-size: 1.1rem; line-height: 1.65; margin: 0; }

/* WHAT WE ARE */
.er-about { background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.er-about-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 48px; align-items: center; }
.er-about p { color: var(--muted); font-size: 1.08rem; line-height: 1.75; margin: 0 0 16px; }
.er-about p strong { color: var(--text); }
.er-statcard { background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 28px; display: grid; gap: 18px; }
.er-statrow { display: flex; align-items: flex-start; gap: 14px; }
.er-statrow .ic { font-size: 1.4rem; line-height: 1; }
.er-statrow b { font-family: 'Outfit'; display: block; font-size: 1rem; margin-bottom: 2px; }
.er-statrow span { color: var(--muted); font-size: 0.9rem; line-height: 1.5; }

/* FEATURES */
.er-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.er-card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 28px; transition: transform .18s ease, border-color .18s, background .18s; }
.er-card:hover { transform: translateY(-4px); border-color: var(--line-2); background: var(--panel-2); }
.er-card .ic { font-size: 1.9rem; display: inline-flex; margin-bottom: 16px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4)); }
.er-card h3 { font-family: 'Outfit'; font-weight: 700; font-size: 1.18rem; margin: 0 0 10px; letter-spacing: -0.01em; }
.er-card p { color: var(--muted); font-size: 0.95rem; line-height: 1.6; margin: 0; }

/* HOW IT WORKS */
.er-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
.er-step { position: relative; padding: 30px 26px; border-radius: 18px; background: var(--panel); border: 1px solid var(--line); }
.er-step .n { font-family: 'Outfit'; font-weight: 900; font-size: 2.4rem; line-height: 1; background: linear-gradient(135deg, var(--gold), var(--gold-2)); -webkit-background-clip: text; background-clip: text; color: transparent; margin-bottom: 16px; }
.er-step h3 { font-family: 'Outfit'; font-size: 1.15rem; margin: 0 0 8px; }
.er-step p { color: var(--muted); font-size: 0.94rem; line-height: 1.6; margin: 0; }

/* PRICING */
.er-pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; max-width: 880px; margin: 0 auto; }
.er-plan { position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: 22px; padding: 34px; display: flex; flex-direction: column; }
.er-plan.pro { border-color: rgba(16,185,129,0.4); background: linear-gradient(180deg, rgba(16,185,129,0.08), var(--panel)); box-shadow: 0 30px 80px -40px rgba(16,185,129,0.5); }
.er-plan-badge { position: absolute; top: -13px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, var(--gold), var(--gold-2)); color: #1c1207; font-family: 'Outfit'; font-weight: 800; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 16px; border-radius: 999px; }
.er-plan-name { font-family: 'Outfit'; font-weight: 700; font-size: 1.15rem; }
.er-plan-price { font-family: 'Outfit'; font-weight: 900; font-size: 3rem; line-height: 1.1; margin: 12px 0 2px; letter-spacing: -0.02em; }
.er-plan-price span { font-size: 1rem; font-weight: 600; color: var(--muted); }
.er-plan-note { color: var(--muted); font-size: 0.88rem; margin: 0 0 22px; }
.er-plan ul { list-style: none; padding: 0; margin: 0 0 26px; display: grid; gap: 12px; }
.er-plan li { display: flex; gap: 11px; align-items: flex-start; font-size: 0.94rem; color: #cdd6e6; line-height: 1.45; }
.er-plan li .ck { color: var(--emerald); font-weight: 900; flex: 0 0 auto; margin-top: 1px; }
.er-plan .er-btn { width: 100%; margin-top: auto; }

/* MISSION */
.er-mission { text-align: center; }
.er-mission-card { max-width: 860px; margin: 0 auto; background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(16,185,129,0.06)); border: 1px solid var(--line-2); border-radius: 28px; padding: 56px 44px; }
.er-mission-card .er-kicker { color: var(--gold); }
.er-mission p { font-size: clamp(1.15rem, 2.2vw, 1.5rem); line-height: 1.6; color: var(--text); font-family: 'Outfit'; font-weight: 500; margin: 0; letter-spacing: -0.01em; }
.er-mission p em { color: var(--gold); font-style: normal; }

/* FINAL CTA */
.er-cta { text-align: center; padding: 90px 0; }
.er-cta h2 { font-family: 'Outfit'; font-weight: 900; font-size: clamp(2rem, 4.5vw, 3.2rem); margin: 0 0 18px; letter-spacing: -0.025em; }
.er-cta p { color: var(--muted); font-size: 1.12rem; margin: 0 0 30px; }

/* FOOTER */
.er-footer { border-top: 1px solid var(--line); padding: 40px 0; }
.er-footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
.er-footer .er-brand-name { font-size: 1rem; }
.er-footer-meta { color: var(--muted); font-size: 0.85rem; }
.er-footer-links { display: flex; gap: 22px; }
.er-footer-links a { color: var(--muted); text-decoration: none; font-size: 0.85rem; }
.er-footer-links a:hover { color: var(--text); }

@media (max-width: 900px) {
  .er-grid, .er-steps { grid-template-columns: 1fr 1fr; }
  .er-about-grid { grid-template-columns: 1fr; gap: 32px; }
}
@media (max-width: 720px) {
  .er-nav-links { display: none; }
  .er-grid, .er-steps, .er-pricing-grid { grid-template-columns: 1fr; }
  .er-hero { padding: 60px 0 48px; }
  .er-section { padding: 60px 0; }
}
`;

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className="er-page" onClick={onAnchorClick}>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* NAV */}
      <nav className="er-nav">
        <div className="er-wrap er-nav-inner">
          <a className="er-brand" href="#top">
            <img src="/logo-full.png" alt="Empire Reviews" />
            <span className="er-brand-name">Empire<span> Reviews</span></span>
          </a>
          <div className="er-nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#mission">Mission</a>
          </div>
          <a className="er-btn er-btn-ghost" href="#pricing">Get started</a>
        </div>
      </nav>

      {/* HERO */}
      <header className="er-hero" id="top">
        <div className="er-wrap">
          <span className="er-eyebrow">★ Built for Shopify merchants</span>
          <h1>
            Turn customer feedback into your <span className="grad">best salesperson</span>
          </h1>
          <p className="er-hero-sub">
            Empire Reviews collects authentic photo &amp; video reviews on autopilot,
            displays them as stunning storefront widgets, and turns sentiment into
            insight — so social proof does the selling for you.
          </p>
          <div id="install">
            <InstallForm showForm={showForm} />
          </div>
          <div className="er-trust">
            <span><span className="er-stars">★★★★★</span></span>
            <span><b>Free</b> forever plan</span>
            <span>·</span>
            <span><b>7-day</b> Pro trial</span>
            <span>·</span>
            <span><b>No code</b> required</span>
            <span>·</span>
            <span>Install in <b>1 click</b></span>
          </div>

          <div className="er-strip">
            <div className="er-chip"><span className="dot" /> Photo &amp; video reviews</div>
            <div className="er-chip"><span className="dot" /> AI sentiment insights</div>
            <div className="er-chip"><span className="dot" /> Google Shopping feed</div>
            <div className="er-chip"><span className="dot" /> No-code widgets</div>
          </div>
        </div>
      </header>

      {/* WHAT WE ARE */}
      <section className="er-section er-about">
        <div className="er-wrap er-about-grid">
          <div>
            <div className="er-kicker">What is Empire Reviews?</div>
            <h2 className="er-h2">A complete review-marketing platform for Shopify</h2>
            <p>
              Empire Reviews is an all-in-one app that helps Shopify merchants
              <strong> collect, showcase, and learn from customer reviews</strong> — without
              the enterprise price tag or a developer on call.
            </p>
            <p>
              From the automated email that asks for a review, to the gorgeous widget
              that displays it, to the AI that tells you what customers really think —
              it&apos;s the entire social-proof flywheel in one place.
            </p>
          </div>
          <div className="er-statcard">
            <div className="er-statrow"><span className="ic">🛍️</span><span><b>Made for storefronts</b>One-click theme widgets that look native to your brand.</span></div>
            <div className="er-statrow"><span className="ic">🔒</span><span><b>Privacy-first &amp; GDPR-ready</b>Encrypted keys, signed uploads, and compliant data handling.</span></div>
            <div className="er-statrow"><span className="ic">💸</span><span><b>Honest pricing</b>A genuinely useful free plan, and Pro at just $9.99/mo.</span></div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="er-section" id="features">
        <div className="er-wrap">
          <div className="er-section-head">
            <div className="er-kicker">What we do</div>
            <h2 className="er-h2">Everything you need to win with reviews</h2>
            <p className="er-lead">
              Six tools that work together to collect more reviews, show them off
              beautifully, and turn them into repeat sales.
            </p>
          </div>
          <div className="er-grid">
            {FEATURES.map((f) => (
              <div className="er-card" key={f.title}>
                <span className="ic">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="er-section er-about" id="how">
        <div className="er-wrap">
          <div className="er-section-head">
            <div className="er-kicker">How it works</div>
            <h2 className="er-h2">From install to social proof in minutes</h2>
          </div>
          <div className="er-steps">
            {STEPS.map((s) => (
              <div className="er-step" key={s.n}>
                <div className="n">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="er-section" id="pricing">
        <div className="er-wrap">
          <div className="er-section-head">
            <div className="er-kicker">What you get</div>
            <h2 className="er-h2">Simple, honest pricing</h2>
            <p className="er-lead">Start free. Upgrade only when Empire Reviews is already earning its keep.</p>
          </div>
          <div className="er-pricing-grid">
            <div className="er-plan">
              <div className="er-plan-name">Free</div>
              <div className="er-plan-price">$0<span> /forever</span></div>
              <p className="er-plan-note">Everything you need to get started.</p>
              <ul>
                <li><span className="ck">✓</span> Up to 50 reviews</li>
                <li><span className="ck">✓</span> Star rating &amp; photo review widgets</li>
                <li><span className="ck">✓</span> Manual review requests</li>
                <li><span className="ck">✓</span> Review moderation &amp; replies</li>
                <li><span className="ck">✓</span> CSV import</li>
              </ul>
              <a className="er-btn er-btn-ghost" href="#install">Start free</a>
            </div>
            <div className="er-plan pro">
              <div className="er-plan-badge">Most popular</div>
              <div className="er-plan-name">Empire Pro</div>
              <div className="er-plan-price">$9.99<span> /month</span></div>
              <p className="er-plan-note">7-day free trial. Cancel anytime.</p>
              <ul>
                <li><span className="ck">✓</span> <strong>Everything in Free, plus:</strong></li>
                <li><span className="ck">✓</span> Unlimited reviews</li>
                <li><span className="ck">✓</span> Photo <em>&amp;</em> video reviews</li>
                <li><span className="ck">✓</span> Automated email campaigns</li>
                <li><span className="ck">✓</span> AI insights, summaries &amp; replies</li>
                <li><span className="ck">✓</span> Google Shopping review feed</li>
                <li><span className="ck">✓</span> Shopify Flow automation</li>
              </ul>
              <a className="er-btn er-btn-primary" href="#install">Start 7-day trial</a>
            </div>
          </div>
        </div>
      </section>

      {/* MISSION */}
      <section className="er-section er-mission" id="mission">
        <div className="er-wrap">
          <div className="er-mission-card">
            <div className="er-kicker">Our mission</div>
            <p>
              Enterprise review tools cost hundreds a month and lock the best features
              behind a sales call. We think <em>every</em> Shopify merchant — not just the
              big brands — deserves world-class social proof at a price that actually
              makes sense. That&apos;s why we built Empire Reviews.
            </p>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="er-cta">
        <div className="er-wrap">
          <h2>Let your reviews do the selling.</h2>
          <p>Join the merchants turning happy customers into their growth engine.</p>
          <div id="install-bottom">
            <InstallForm showForm={showForm} />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="er-footer">
        <div className="er-wrap er-footer-inner">
          <a className="er-brand" href="#top">
            <img src="/logo-full.png" alt="Empire Reviews" style={{ height: 24 }} />
            <span className="er-brand-name">Empire<span> Reviews</span></span>
          </a>
          <div className="er-footer-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#how">How it works</a>
          </div>
          <div className="er-footer-meta">© {new Date().getFullYear()} Empire Reviews · Built for Shopify</div>
        </div>
      </footer>
    </div>
  );
}
