import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "pdfkit"],
  outputFileTracingIncludes: {
    "/api/export": ["./node_modules/pdfkit/js/data/*.afm"],
    "/api/statistics/pdf": ["./node_modules/pdfkit/js/data/*.afm"],
  },
  distDir:
    process.env.MAPPLEO_SYNC_E2E === "1"
      ? ".next-sync-e2e"
      : process.env.MAPPLEO_DEPLOY_CHECK === "1"
        ? ".next-deploy-check"
        : process.env.MAPPLEO_HTTPS_TEST === "1"
          ? ".next-https-test"
          : process.env.MAPPLEO_E2E === "1"
            ? ".next-e2e"
            : ".next",
  async headers() {
    return [
      {
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};
export default config;
