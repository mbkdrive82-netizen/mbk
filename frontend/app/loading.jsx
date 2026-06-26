'use client';

/**
 * Root-level loading.jsx
 * Shown by Next.js during route transitions and initial page loads.
 * Uses CSS-only animation — zero JS overhead, works during hydration.
 */
export default function Loading() {
  return (
    <div className="mbk-loading-screen" aria-label="Loading…" role="status">
      <style>{`
        .mbk-loading-screen {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0a1628 0%, #0c2438 50%, #0d1f3c 100%);
          z-index: 9999;
          gap: 2rem;
        }

        /* Logo pulse */
        .mbk-loading-logo {
          width: 64px;
          height: 64px;
          border-radius: 16px;
          background: linear-gradient(135deg, #1e4a7a, #2d6cb5);
          animation: mbk-logo-pulse 1.6s ease-in-out infinite;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 1.25rem;
          color: #fff;
          letter-spacing: -0.05em;
          font-family: system-ui, sans-serif;
          box-shadow: 0 0 0 0 rgba(45, 108, 181, 0.5);
        }

        @keyframes mbk-logo-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(45, 108, 181, 0.4); }
          50%       { transform: scale(1.05); box-shadow: 0 0 0 16px rgba(45, 108, 181, 0); }
        }

        /* Skeleton card group */
        .mbk-skeleton-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: min(360px, 90vw);
        }

        .mbk-skeleton-bar {
          border-radius: 8px;
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.04) 0%,
            rgba(255,255,255,0.10) 50%,
            rgba(255,255,255,0.04) 100%
          );
          background-size: 200% 100%;
          animation: mbk-shimmer 1.5s linear infinite;
        }

        @keyframes mbk-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Progress bar at bottom */
        .mbk-loading-bar-track {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: rgba(255,255,255,0.05);
        }

        .mbk-loading-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #1e6ac8, #38bdf8, #1e6ac8);
          background-size: 200% 100%;
          animation: mbk-progress 1.8s ease-in-out infinite;
        }

        @keyframes mbk-progress {
          0%   { width: 0%; background-position: 0% 0; }
          50%  { width: 70%; background-position: 100% 0; }
          100% { width: 100%; background-position: 0% 0; }
        }
      `}</style>

      {/* Logo */}
      <div className="mbk-loading-logo" aria-hidden="true">MBK</div>

      {/* Skeleton bars simulating content loading */}
      <div className="mbk-skeleton-group" aria-hidden="true">
        <div className="mbk-skeleton-bar" style={{ height: '20px', width: '70%' }} />
        <div className="mbk-skeleton-bar" style={{ height: '14px', width: '100%' }} />
        <div className="mbk-skeleton-bar" style={{ height: '14px', width: '85%' }} />
        <div className="mbk-skeleton-bar" style={{ height: '14px', width: '60%' }} />
        <div style={{ height: '8px' }} />
        <div className="mbk-skeleton-bar" style={{ height: '40px', width: '100%', borderRadius: '10px' }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <div className="mbk-skeleton-bar" style={{ height: '40px', flex: 1, borderRadius: '10px' }} />
          <div className="mbk-skeleton-bar" style={{ height: '40px', flex: 1, borderRadius: '10px' }} />
        </div>
      </div>

      {/* Bottom progress indicator */}
      <div className="mbk-loading-bar-track">
        <div className="mbk-loading-bar-fill" />
      </div>

      <span className="sr-only">Loading MBK Carrierz Portal…</span>
    </div>
  );
}
