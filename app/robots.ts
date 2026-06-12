// Next.js auto-serves this at /robots.txt
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://realtrack.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/tutorial", "/login"],
        disallow: [
          "/admin/",
          "/dashboard/",
          "/api/",
          "/forgot-password",
          "/reset-password",
          "/pay",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
