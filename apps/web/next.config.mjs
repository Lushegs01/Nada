import nextPwa from "next-pwa";

const withPWA = nextPwa({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  importScripts: ["/worker-bootstrap.js"],
  register: true,
  scope: "/",
  skipWaiting: true,
  sw: "sw.js"
});

// Build connect-src from configured relay URL so the browser can only talk to
// the relay we deployed. Falls back to allowing any https/wss in dev so local
// setups without NEXT_PUBLIC_RELAY_URL keep working.
function deriveConnectSrc() {
  const relay = process.env.NEXT_PUBLIC_RELAY_URL;
  const baseSelf = "'self' data:";
  const livekitDefaults = "https://*.livekit.cloud wss://*.livekit.cloud";
  if (!relay) {
    if (process.env.NODE_ENV === "production") {
      // Production must specify the relay explicitly. Keep something usable
      // but still narrower than `https: wss:`.
      return `${baseSelf} ${livekitDefaults}`;
    }
    return `${baseSelf} https: wss: ws:`;
  }
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(relay) ? relay : `https://${relay}`);
    const wssOrigin = `wss://${url.host}`;
    const httpsOrigin = `https://${url.host}`;
    return `${baseSelf} ${httpsOrigin} ${wssOrigin} ${livekitDefaults}`;
  } catch {
    return `${baseSelf} ${livekitDefaults}`;
  }
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  `connect-src ${deriveConnectSrc()}`,
  "font-src 'self' data: https://fonts.gstatic.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  // 'wasm-unsafe-eval' lets libsodium initialize WASM without enabling eval();
  // 'unsafe-inline' is still required by Next.js for hydration scripts and
  // should be removed when nonces are wired through middleware.
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "worker-src 'self' blob:"
].join("; ");

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: false
  },
  typescript: {
    ignoreBuildErrors: false
  },
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@nada/crypto", "@nada/db", "@nada/types", "@nada/ui"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(), payment=()"
          }
        ]
      }
    ];
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: "buffer",
        crypto: "crypto-browserify",
        stream: "stream-browserify",
        util: false,
        assert: false,
        fs: false,
        path: false,
        os: false
      };

      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: "process/browser"
        })
      );
    }
    return config;
  }
};

export default withPWA(nextConfig);
