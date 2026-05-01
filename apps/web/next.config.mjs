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

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' https: wss: ws:",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:"
].join("; ");

const nextConfig = {
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
