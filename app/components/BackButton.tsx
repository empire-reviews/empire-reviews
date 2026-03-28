import { Link } from "@remix-run/react";

/**
 * 3D Animated Back Button Component
 * Uses Remix's <Link> for client-side navigation — critical for Shopify
 * embedded apps where a hard <a href> causes a full page reload that
 * strips the `host` + `shop` params and triggers an auth redirect loop.
 */
export function BackButton({ to = "/app", label = "← Back to Dashboard" }: { to?: string; label?: string }) {
  return (
    <>
      <style>{`
        .empire-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 22px;
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          color: #e2e8f0;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
          position: relative;
          overflow: hidden;
          z-index: 50;
          margin-bottom: 16px;
        }
        .empire-back-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%);
          opacity: 0;
          transition: opacity 0.3s ease;
          border-radius: 12px;
        }
        .empire-back-btn:hover {
          transform: translateY(-3px) scale(1.03);
          box-shadow: 0 12px 30px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
          color: white;
          border-color: rgba(59, 130, 246, 0.4);
        }
        .empire-back-btn:hover::before {
          opacity: 1;
        }
        .empire-back-btn:active {
          transform: translateY(0px) scale(0.98);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        .empire-back-btn span {
          position: relative;
          z-index: 1;
        }
      `}</style>
      <Link to={to} className="empire-back-btn">
        <span>{label}</span>
      </Link>
    </>
  );
}
