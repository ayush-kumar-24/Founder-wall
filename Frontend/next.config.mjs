/** @type {import('next').NextConfig} */

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig = {
  // Emit a self-contained server bundle so the production image ships only the
  // files it needs to run (see Frontend/Dockerfile), not the whole node_modules.
  output: "standalone",
  // Don't advertise the framework.
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Self-hosted fonts + hashed assets are content-stable → cache for a year,
      // immutable (the URL changes when the file does, so this is always safe).
      {
        source: "/assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Brand logo lives in public/ under a stable name — cache a week (it
      // changes rarely, and a week keeps repeat visits fast without pinning a
      // stale logo for a year).
      {
        source: "/Goxl-Entrepreneurship.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default nextConfig;
