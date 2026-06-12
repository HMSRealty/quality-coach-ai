// Next.js auto-serves this at /sitemap.xml
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://realtrack.app";
  const now = new Date();
  return [
    { url: `${base}/`,         lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${base}/tutorial`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/login`,    lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
  ];
}
