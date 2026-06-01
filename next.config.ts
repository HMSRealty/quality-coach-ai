import type { NextConfig } from "next";

// Enable @cloudflare/next-on-pages dev bindings during `next dev`
// so process.env reads from .dev.vars (matching production Pages env).
if (process.env.NODE_ENV === "development") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { setupDevPlatform } = require("@cloudflare/next-on-pages/next-dev");
  setupDevPlatform().catch(() => {});
}

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
