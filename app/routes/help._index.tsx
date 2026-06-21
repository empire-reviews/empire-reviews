import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

import {
  HELP_COLLECTIONS,
  getArticlesByCollection,
  getFeaturedArticles,
  collectionArticleCount,
} from "../lib/help-articles";

export const meta: MetaFunction = () => {
  return [
    { title: "Empire Reviews Help Center — Guides, Setup & FAQs" },
    {
      name: "description",
      content:
        "Help and how-to guides for Empire Reviews, the Shopify review app. Install widgets, collect reviews, set up email campaigns, use AI features, and manage billing.",
    },
  ];
};

export const loader = async (_args: LoaderFunctionArgs) => {
  const collections = HELP_COLLECTIONS.map((c) => {
    const articles = getArticlesByCollection(c.id);
    return {
      ...c,
      count: collectionArticleCount(c.id),
      firstSlug: articles[0]?.slug ?? null,
    };
  });

  const featured = getFeaturedArticles().map((a) => ({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    proOnly: Boolean(a.proOnly),
  }));

  return { collections, featured };
};

const css = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');

:root {
  --ink: #070b16;
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
.help-page { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
.help-page a { text-decoration: none; }

.help-root {
  position: relative;
  min-height: 100vh;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(900px 600px at 12% -5%, rgba(245,158,11,0.16), transparent 60%),
    radial-gradient(820px 560px at 92% 4%, rgba(16,185,129,0.14), transparent 60%),
    radial-gradient(1000px 700px at 50% 110%, rgba(99,102,241,0.10), transparent 60%),
    var(--ink);
}
.help-wrap { width: 100%; max-width: 1120px; margin: 0 auto; padding: 0 24px; }

/* NAV */
.help-nav {
  position: sticky; top: 0; z-index: 50;
  backdrop-filter: blur(14px);
  background: rgba(7,11,22,0.72);
  border-bottom: 1px solid var(--line);
}
.help-nav-inner { display: flex; align-items: center; justify-content: space-between; height: 68px; }
.help-brand { display: flex; align-items: center; gap: 10px; color: var(--text); }
.help-brand img { height: 30px; width: auto; }
.help-brand-name { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1.12rem; letter-spacing: -0.01em; }
.help-brand-name span { background: linear-gradient(90deg, var(--gold), var(--gold-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.help-nav-links { display: flex; align-items: center; gap: 30px; }
.help-nav-links a { color: var(--muted); font-size: 0.92rem; font-weight: 500; transition: color .15s; }
.help-nav-links a:hover { color: var(--text); }

/* HERO */
.help-hero { padding: 72px 0 48px; text-align: center; }
.help-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'Outfit', sans-serif;
  font-size: 0.78rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--gold); background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.28);
  padding: 7px 14px; border-radius: 999px; margin-bottom: 24px;
}
.help-hero h1 {
  font-family: 'Outfit', sans-serif; font-weight: 900; letter-spacing: -0.025em; line-height: 1.05;
  font-size: clamp(2.2rem, 5vw, 3.6rem); margin: 0 auto 18px; max-width: 18ch;
}
.help-hero h1 .grad { background: linear-gradient(100deg, var(--gold) 10%, #fde68a 45%, var(--emerald) 95%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.help-hero p { font-size: clamp(1.02rem, 2vw, 1.2rem); color: var(--muted); max-width: 60ch; margin: 0 auto; line-height: 1.6; }

/* SECTION */
.help-section { padding: 16px 0 64px; }
.help-kicker { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 0.82rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--emerald); margin: 0 0 14px; }
.help-h2 { font-family: 'Outfit', sans-serif; font-weight: 800; letter-spacing: -0.02em; font-size: clamp(1.5rem, 3vw, 2.1rem); margin: 0 0 26px; line-height: 1.1; }

/* COLLECTION GRID */
.help-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.help-coll {
  display: block;
  background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 26px;
  transition: transform .18s ease, border-color .18s, background .18s;
  color: var(--text);
}
.help-coll:hover { transform: translateY(-4px); border-color: var(--line-2); background: var(--panel-2); }
.help-coll .ic { font-size: 1.9rem; display: inline-flex; margin-bottom: 14px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4)); }
.help-coll h3 { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 1.16rem; margin: 0 0 8px; letter-spacing: -0.01em; }
.help-coll p { color: var(--muted); font-size: 0.94rem; line-height: 1.55; margin: 0 0 14px; }
.help-coll .count { font-family: 'Outfit', sans-serif; font-size: 0.82rem; font-weight: 600; color: var(--emerald); }

/* POPULAR LIST */
.help-popular { margin-top: 56px; }
.help-list { display: grid; gap: 12px; }
.help-li {
  display: flex; align-items: flex-start; gap: 14px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px;
  color: var(--text); transition: border-color .15s, background .15s;
}
.help-li:hover { border-color: var(--line-2); background: var(--panel-2); }
.help-li .arrow { color: var(--emerald); font-weight: 900; margin-top: 1px; }
.help-li-body { flex: 1; }
.help-li-title { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 1.02rem; margin: 0 0 3px; letter-spacing: -0.01em; }
.help-li-sum { color: var(--muted); font-size: 0.9rem; line-height: 1.5; margin: 0; }
.help-pro-pill { display: inline-block; margin-left: 8px; font-family: 'Outfit', sans-serif; font-size: 0.66rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #1c1207; background: linear-gradient(135deg, var(--gold), var(--gold-2)); padding: 2px 8px; border-radius: 999px; vertical-align: middle; }

/* FOOTER */
.help-footer { border-top: 1px solid var(--line); padding: 36px 0; margin-top: 24px; }
.help-footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
.help-footer-meta { color: var(--muted); font-size: 0.85rem; }
.help-footer-links { display: flex; gap: 22px; }
.help-footer-links a { color: var(--muted); font-size: 0.85rem; }
.help-footer-links a:hover { color: var(--text); }

@media (max-width: 900px) { .help-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 720px) {
  .help-nav-links { display: none; }
  .help-grid { grid-template-columns: 1fr; }
  .help-hero { padding: 52px 0 40px; }
}
`;

export default function HelpIndex() {
  const { collections, featured } = useLoaderData<typeof loader>();

  return (
    <div className="help-page">
      <div className="help-root">
        <style dangerouslySetInnerHTML={{ __html: css }} />

        <nav className="help-nav">
          <div className="help-wrap help-nav-inner">
            <a className="help-brand" href="/">
              <img src="/logo-full.png" alt="Empire Reviews" />
              <span className="help-brand-name">
                Empire<span> Reviews</span>
              </span>
            </a>
            <div className="help-nav-links">
              <a href="/#features">Features</a>
              <a href="/#pricing">Pricing</a>
              <Link to="/help">Help Center</Link>
            </div>
            <a className="help-brand-name" href="/" style={{ fontSize: "0.92rem" }}>
              ← Home
            </a>
          </div>
        </nav>

        <header className="help-hero">
          <div className="help-wrap">
            <span className="help-eyebrow">★ Support &amp; guides</span>
            <h1>
              Empire Reviews <span className="grad">Help Center</span>
            </h1>
            <p>
              Guides and answers for setting up Empire Reviews, collecting and
              displaying reviews, using AI features, and managing your plan.
            </p>
          </div>
        </header>

        <section className="help-section">
          <div className="help-wrap">
            <p className="help-kicker">Browse by topic</p>
            <h2 className="help-h2">Help collections</h2>
            <div className="help-grid">
              {collections.map((c) => {
                const to = c.firstSlug ? `/help/${c.firstSlug}` : "/help";
                return (
                  <Link className="help-coll" key={c.id} to={to}>
                    <span className="ic" aria-hidden="true">
                      {c.icon}
                    </span>
                    <h3>{c.title}</h3>
                    <p>{c.description}</p>
                    <span className="count">
                      {c.count} {c.count === 1 ? "article" : "articles"} →
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className="help-popular">
              <p className="help-kicker">Most read</p>
              <h2 className="help-h2">Popular articles</h2>
              <div className="help-list">
                {featured.map((a) => (
                  <Link className="help-li" key={a.slug} to={`/help/${a.slug}`}>
                    <span className="arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="help-li-body">
                      <span className="help-li-title">
                        {a.title}
                        {a.proOnly ? (
                          <span className="help-pro-pill">Pro</span>
                        ) : null}
                      </span>
                      <span className="help-li-sum">{a.summary}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="help-footer">
          <div className="help-wrap help-footer-inner">
            <a className="help-brand" href="/">
              <span className="help-brand-name" style={{ fontSize: "1rem" }}>
                Empire<span> Reviews</span>
              </span>
            </a>
            <div className="help-footer-links">
              <a href="/#features">Features</a>
              <a href="/#pricing">Pricing</a>
              <Link to="/help">Help Center</Link>
            </div>
            <div className="help-footer-meta">
              © {new Date().getFullYear()} Empire Reviews · Built for Shopify
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
