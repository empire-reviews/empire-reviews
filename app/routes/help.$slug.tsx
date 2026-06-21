import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

import type { HelpBlock } from "../lib/help-articles";
import {
  getArticle,
  getCollection,
  getArticlesByCollection,
  tableOfContents,
} from "../lib/help-articles";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) {
    return [{ title: "Article not found — Empire Reviews Help" }];
  }
  return [
    { title: `${data.article.title} — Empire Reviews Help` },
    { name: "description", content: data.article.summary },
  ];
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Same id derivation tableOfContents() uses, so heading anchors line up. */
function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const article = getArticle(params.slug ?? "");
  if (!article) {
    throw new Response("Not Found", { status: 404 });
  }

  const collection = getCollection(article.collection) ?? null;
  const toc = tableOfContents(article);
  const related = getArticlesByCollection(article.collection)
    .filter((a) => a.slug !== article.slug)
    .map((a) => ({ slug: a.slug, title: a.title, summary: a.summary }));

  return { article, collection, toc, related };
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
html { scroll-behavior: smooth; scroll-padding-top: 88px; }
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
.help-wrap { width: 100%; max-width: 860px; margin: 0 auto; padding: 0 24px; }

/* NAV */
.help-nav {
  position: sticky; top: 0; z-index: 50;
  backdrop-filter: blur(14px);
  background: rgba(7,11,22,0.72);
  border-bottom: 1px solid var(--line);
}
.help-nav-inner { display: flex; align-items: center; justify-content: space-between; height: 68px; max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.help-brand { display: flex; align-items: center; gap: 10px; color: var(--text); }
.help-brand img { height: 30px; width: auto; }
.help-brand-name { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1.12rem; letter-spacing: -0.01em; }
.help-brand-name span { background: linear-gradient(90deg, var(--gold), var(--gold-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.help-nav-links { display: flex; align-items: center; gap: 30px; }
.help-nav-links a { color: var(--muted); font-size: 0.92rem; font-weight: 500; transition: color .15s; }
.help-nav-links a:hover { color: var(--text); }

/* ARTICLE */
.help-article { padding: 40px 0 72px; }
.help-crumb { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 0.85rem; color: var(--muted); margin-bottom: 26px; }
.help-crumb a { color: var(--muted); transition: color .15s; }
.help-crumb a:hover { color: var(--text); }
.help-crumb .sep { color: var(--line-2); }
.help-crumb .current { color: var(--text); font-weight: 500; }

.help-title { font-family: 'Outfit', sans-serif; font-weight: 900; letter-spacing: -0.025em; line-height: 1.08; font-size: clamp(1.9rem, 4vw, 2.8rem); margin: 0 0 12px; }
.help-meta { color: var(--muted); font-size: 0.88rem; margin: 0 0 28px; }

.help-pro {
  display: flex; align-items: flex-start; gap: 12px;
  background: linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.04));
  border: 1px solid rgba(245,158,11,0.3); border-radius: 14px; padding: 16px 18px; margin: 0 0 30px;
}
.help-pro .ic { font-size: 1.3rem; line-height: 1; }
.help-pro b { font-family: 'Outfit', sans-serif; color: var(--gold); display: block; font-size: 0.98rem; margin-bottom: 2px; }
.help-pro span { color: var(--muted); font-size: 0.9rem; line-height: 1.5; }

/* TOC */
.help-toc { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 22px 24px; margin: 0 0 36px; }
.help-toc h2 { font-family: 'Outfit', sans-serif; font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--emerald); margin: 0 0 12px; font-weight: 700; }
.help-toc ol { margin: 0; padding-left: 18px; display: grid; gap: 8px; }
.help-toc a { color: var(--text); font-size: 0.96rem; transition: color .15s; }
.help-toc a:hover { color: var(--gold); }

/* BODY */
.help-body { font-size: 1.04rem; line-height: 1.75; }
.help-body h2 { font-family: 'Outfit', sans-serif; font-weight: 800; letter-spacing: -0.015em; font-size: 1.5rem; margin: 40px 0 14px; scroll-margin-top: 92px; }
.help-body p { color: #cdd6e6; margin: 0 0 18px; }
.help-body ul, .help-body ol { color: #cdd6e6; margin: 0 0 18px; padding-left: 24px; display: grid; gap: 9px; }
.help-body li { line-height: 1.65; }
.help-body ol.help-steps li { padding-left: 4px; }
.help-callout {
  display: flex; gap: 12px; align-items: flex-start;
  background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03));
  border: 1px solid rgba(16,185,129,0.28); border-radius: 14px; padding: 16px 18px; margin: 0 0 22px;
}
.help-callout .ic { color: var(--emerald); font-weight: 900; line-height: 1.6; }
.help-callout p { margin: 0; color: #d4ecdf; }

/* RELATED */
.help-related { margin-top: 52px; border-top: 1px solid var(--line); padding-top: 36px; }
.help-related h2 { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1.3rem; margin: 0 0 18px; letter-spacing: -0.01em; }
.help-related-list { display: grid; gap: 12px; }
.help-related-li { display: flex; align-items: flex-start; gap: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; color: var(--text); transition: border-color .15s, background .15s; }
.help-related-li:hover { border-color: var(--line-2); background: var(--panel-2); }
.help-related-li .arrow { color: var(--emerald); font-weight: 900; margin-top: 1px; }
.help-related-li b { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 1rem; display: block; margin-bottom: 2px; }
.help-related-li span { color: var(--muted); font-size: 0.88rem; line-height: 1.5; }

.help-back { margin-top: 40px; }
.help-back a { color: var(--emerald); font-weight: 600; font-size: 0.95rem; }

/* FOOTER */
.help-footer { border-top: 1px solid var(--line); padding: 36px 0; }
.help-footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.help-footer-meta { color: var(--muted); font-size: 0.85rem; }
.help-footer-links { display: flex; gap: 22px; }
.help-footer-links a { color: var(--muted); font-size: 0.85rem; }
.help-footer-links a:hover { color: var(--text); }

@media (max-width: 720px) {
  .help-nav-links { display: none; }
}
`;

function Block({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case "heading":
      return <h2 id={headingId(block.text)}>{block.text}</h2>;
    case "paragraph":
      return <p>{block.text}</p>;
    case "list":
      return (
        <ul>
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="help-steps">
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      );
    case "callout":
      return (
        <div className="help-callout">
          <span className="ic" aria-hidden="true">
            ✦
          </span>
          <p>{block.text}</p>
        </div>
      );
    default:
      return null;
  }
}

export default function HelpArticle() {
  const { article, collection, toc, related } = useLoaderData<typeof loader>();

  return (
    <div className="help-page">
      <div className="help-root">
        <style dangerouslySetInnerHTML={{ __html: css }} />

        <nav className="help-nav">
          <div className="help-nav-inner">
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
            <Link
              className="help-brand-name"
              to="/help"
              style={{ fontSize: "0.92rem" }}
            >
              ← All articles
            </Link>
          </div>
        </nav>

        <article className="help-article">
          <div className="help-wrap">
            <nav className="help-crumb" aria-label="Breadcrumb">
              <Link to="/help">Help</Link>
              <span className="sep" aria-hidden="true">
                /
              </span>
              {collection ? (
                <>
                  <Link to="/help">{collection.title}</Link>
                  <span className="sep" aria-hidden="true">
                    /
                  </span>
                </>
              ) : null}
              <span className="current">{article.title}</span>
            </nav>

            <h1 className="help-title">{article.title}</h1>
            <p className="help-meta">Updated {formatDate(article.updated)}</p>

            {article.proOnly ? (
              <div className="help-pro">
                <span className="ic" aria-hidden="true">
                  ✨
                </span>
                <span>
                  <b>Available on Empire Pro</b>
                  <span>
                    This feature is part of Empire Pro ($9.99/month, 7-day free
                    trial). Upgrade from the Plans page in the app to unlock it.
                  </span>
                </span>
              </div>
            ) : null}

            {toc.length > 0 ? (
              <nav className="help-toc" aria-label="Table of contents">
                <h2>On this page</h2>
                <ol>
                  {toc.map((t) => (
                    <li key={t.id}>
                      <a href={`#${t.id}`}>{t.text}</a>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}

            <div className="help-body">
              {article.body.map((block, i) => (
                <Block block={block} key={i} />
              ))}
            </div>

            {related.length > 0 ? (
              <section className="help-related">
                <h2>
                  More in {collection ? collection.title : "this collection"}
                </h2>
                <div className="help-related-list">
                  {related.map((r) => (
                    <Link
                      className="help-related-li"
                      key={r.slug}
                      to={`/help/${r.slug}`}
                    >
                      <span className="arrow" aria-hidden="true">
                        →
                      </span>
                      <span>
                        <b>{r.title}</b>
                        <span>{r.summary}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="help-back">
              <Link to="/help">← Back to Help Center</Link>
            </div>
          </div>
        </article>

        <footer className="help-footer">
          <div className="help-footer-inner">
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
