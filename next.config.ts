import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The editor is a client app over route handlers; Cache Components/partial
  // prefetching add nothing here and complicate per-request auth reads.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The guides first went live at the top level; keep those addresses working.
  async redirects() {
    return ["outlook-email-template", "outlook-rendering", "outlook-rounded-buttons", "oft-vs-msg-vs-emltpl"].map((slug) => ({
      source: `/${slug}`,
      destination: `/guides/${slug}`,
      permanent: true,
    }));
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
