import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },

  // Skip lint + type errors during production build — they're caught locally
  // and would otherwise block Cloudflare deploys on noisy edge cases.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },

  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },

  // Tell Next.js this directory IS the workspace root so it stops trying to
  // climb up to C:\Users\Mohamed\package-lock.json.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
