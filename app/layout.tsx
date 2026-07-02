import type { Metadata, Viewport } from "next";
import { Sora, Manrope, JetBrains_Mono } from "next/font/google";
import { SmoothScroll } from "@/app/_components/SmoothScroll";
import { Toaster } from "sonner";
import "./globals.css";

// Manrope — the body / UI typeface (Ascendyaa brand).
// Mapped onto --font-geist-sans so every existing token resolves to it.
const manrope = Manrope({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// JetBrains Mono — metrics / code-ish numerics.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "700"],
});

// Sora — display face for headings (Ascendyaa brand).
const sora = Sora({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://realtrack.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RealTrack by Ascendyaa — Track every call. Close every deal.",
    template: "%s · RealTrack by Ascendyaa",
  },
  description:
    "RealTrack by Ascendyaa is the all-in-one operations platform for real-estate call floors and wholesalers — qualify leads, coach your floor, track performance with live dashboards, and run disposition, all in one place.",
  keywords: [
    "realtrack", "realtrack.app", "RealTrack by Ascendyaa", "Ascendyaa",
    "real estate wholesaling", "cold calling QA", "call analytics",
    "acquisitions CRM", "lead intake", "AI call qualification",
    "AI call grading", "wholesaling software", "real estate call center",
  ],
  applicationName: "RealTrack by Ascendyaa",
  authors: [{ name: "Ascendyaa", url: SITE_URL }],
  creator: "Ascendyaa",
  publisher: "Ascendyaa",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }], shortcut: "/favicon.svg", apple: "/favicon.svg" },
  alternates: { canonical: "/" },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    siteName: "RealTrack by Ascendyaa",
    url: SITE_URL,
    locale: "en_US",
    title: "RealTrack by Ascendyaa — Track every call. Close every deal.",
    description: "An Ascendyaa product. The all-in-one operations platform for real-estate call floors — qualify, coach, track, and dispose, all in one place.",
    images: [{ url: `${SITE_URL}/og.png`, width: 1200, height: 630, alt: "RealTrack by Ascendyaa — real-estate operations, end to end" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RealTrack by Ascendyaa — Track every call. Close every deal.",
    description: "Real-estate operations, end to end: qualify, coach, track, and dispose — all in one place. realtrack.app",
    images: [`${SITE_URL}/og.png`],
  },
  category: "business",
};

export const viewport: Viewport = {
  themeColor: "#15131D",
};

// JSON-LD structured data — helps search engines understand what RealTrack is
// and who's behind it. Includes Organization, SoftwareApplication, and WebSite.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "Ascendyaa",
      alternateName: ["RealTrack by Ascendyaa", "Ascendyaa", "realtrack.app"],
      url: SITE_URL,
      logo: `${SITE_URL}/ascendya-mark.svg`,
      email: "info@realtrack.app",
      sameAs: [SITE_URL],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "RealTrack by Ascendyaa",
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "All-in-one operations platform for real-estate wholesalers and call centers — qualify, coach, track, and dispose, all in one place.",
      offers: [
        { "@type": "Offer", name: "Starter",      price: "350",   priceCurrency: "USD", description: "500 analyses/month, 1 workspace" },
        { "@type": "Offer", name: "Professional", price: "750",   priceCurrency: "USD", description: "2,000 analyses/month, unlimited campaigns" },
        { "@type": "Offer", name: "Enterprise",   price: "1500",  priceCurrency: "USD", description: "Unlimited analyses, multi-tenant + white-label" },
      ],
      aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", reviewCount: "12" },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#site`,
      url: SITE_URL,
      name: "RealTrack by Ascendyaa",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${jetbrainsMono.variable} ${sora.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
        <link rel="canonical" href={SITE_URL} />
      </head>
      <body>
        <SmoothScroll />
        {children}
        <Toaster position="bottom-right" expand gap={10} toastOptions={{ unstyled: true }} />
      </body>
    </html>
  );
}
