import bundleAnalyzer from '@next/bundle-analyzer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readRootEnvValue = (key) => {
  try {
    const envPath = path.resolve(__dirname, '../.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return match?.[1]?.trim().replace(/^["']|["']$/g, '') || '';
  } catch {
    return '';
  }
};

const rootBackendPort = readRootEnvValue('BACKEND_PORT') || readRootEnvValue('PORT') || '5006';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const defaultLocalApiUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_ORIGIN ||
  `http://localhost:${rootBackendPort}`;
const rawBaseUrl = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_ORIGIN || "").trim();
const cleanBaseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, "").replace(/\/api\/?$/i, "") : "";
const devApiOrigin = cleanBaseUrl || defaultLocalApiUrl.replace(/\/api\/?$/i, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,

  // Standalone output creates a minimal deployment bundle (ideal for Docker)
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [75, 80],
    deviceSizes: [320, 375, 640, 750, 828, 1080, 1200, 1920, 2560],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000, // 1 year
    remotePatterns: [
      { protocol: 'https', hostname: '**.cloudinary.com' },
      { protocol: 'https', hostname: '**.mbktechnologies.info' },
    ],
  },

  // Strip console.log in production (reduces bundle size + prevents leaks)
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  // Enable gzip/brotli response compression
  compress: true,
  // Remove X-Powered-By fingerprinting header
  poweredByHeader: false,
  reactStrictMode: true,
  // Don't ship source maps to production (reduces bundle & hides source code)
  productionBrowserSourceMaps: false,

  transpilePackages: ['@heroicons/react'],

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@heroicons/react/24/outline',
      '@heroicons/react/24/solid',
      '@heroicons/react/20/solid',
      'date-fns',
      'antd',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-popover',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-label',
      '@radix-ui/react-slot',
    ],
  },

  // Output file tracing root (moved from experimental in Next.js 15+)
  outputFileTracingRoot: path.resolve(__dirname),

  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    
    const connectSources = ["'self'", "https://*.getstream.io", "https://*.stream-io-api.com", "https://*.firebaseapp.com", "https://*.googleapis.com", "https://*.firebase.com"];
    const imgSources = ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://i.ibb.co", "https://maps.gstatic.com", "https://*.googleapis.com"];
    const scriptSources = ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://maps.googleapis.com", "https://apis.google.com"];
    const styleSources = ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"];
    const fontSources = ["'self'", "data:", "https://fonts.gstatic.com"];
    const frameSources = ["'self'", "https://*.firebaseapp.com"];
    
    if (isProd) {
      connectSources.push("https://trainer.mbktechnologies.info", "https://*.mbktechnologies.info", "wss://trainer.mbktechnologies.info", "wss://*.mbktechnologies.info");
      imgSources.push("https://trainer.mbktechnologies.info", "https://*.mbktechnologies.info");
      scriptSources.push("https://trainer.mbktechnologies.info", "https://*.mbktechnologies.info");
      styleSources.push("https://trainer.mbktechnologies.info", "https://*.mbktechnologies.info");
    } else {
      const localApiPorts = ["5005", "5003", "5004", "5006", "5007", "5008", "5001", "5000", "3000", "3001"];
      localApiPorts.forEach((port) => {
        connectSources.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
        imgSources.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
        scriptSources.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
        styleSources.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
      });
      connectSources.push("ws://localhost:*", "wss://localhost:*");
    }

    const csp = [
      `default-src 'self'`,
      `connect-src ${connectSources.join(" ")}`,
      `img-src ${imgSources.join(" ")}`,
      `script-src ${scriptSources.join(" ")}`,
      `style-src ${styleSources.join(" ")}`,
      `font-src ${fontSources.join(" ")}`,
      `frame-src ${frameSources.join(" ")}`,
    ].join("; ");

    const headers = [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];

    if (isProd) {
      headers.push(
        {
          // Long-lived cache for logos (versioned manually)
          source: '/logos/:path*',
          headers: [
            { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          ],
        },
      );
    }

    headers.push({
      // API responses should NOT be cached by CDN
      source: '/api/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
      ],
    });

    return headers;
  },

  async rewrites() {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${devApiOrigin}/api/:path*`,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
