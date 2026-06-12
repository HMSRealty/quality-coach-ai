import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono, Space_Grotesk } from "next/font/google";
import { SmoothScroll } from "@/app/_components/SmoothScroll";
import { Toaster } from "sonner";
import "./globals.css";

// Inter — the enterprise UI typeface (Linear / Stripe / Gong vibe).
const inter = Inter({
  variable: "--font-geist-sans",        // keep the existing var name so all tokens resolve
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Display face for headings — bold grotesk for editorial punch
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://realtrack.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RealTrack — AI Call QA & Acquisitions OS | realtrack.app",
    template: "%s · RealTrack",
  },
  description:
    "RealTrack listens to every cold call, qualifies leads against The Four Pillars, routes Hot leads to acquisitions. Built for real-estate wholesalers and call centers like HMS Realty. Visit realtrack.app to start.",
  keywords: [
    "realtrack", "realtrack.app", "real track app",
    "HMS Realty", "hmsrealty", "HMS Realty LLC",
    "real estate wholesaling", "cold calling QA", "call analytics",
    "acquisitions CRM", "lead intake", "AI call qualification",
    "AI call grading", "wholesaling software", "real estate call center",
  ],
  applicationName: "RealTrack",
  authors: [{ name: "RealTrack", url: SITE_URL }],
  creator: "RealTrack",
  publisher: "RealTrack",
  alternates: { canonical: "/" },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    siteName: "RealTrack",
    url: SITE_URL,
    locale: "en_US",
    title: "RealTrack — AI-powered Real Estate Call QA & Acquisitions OS",
    description: "Qualify every call against The Four Pillars, surface Hot leads in seconds, coach agents automatically. The OS for high-volume real-estate call centers.",
    images: [{ url: `${SITE_URL}/og.png`, width: 1200, height: 630, alt: "RealTrack — AI call qualification for real-estate teams" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RealTrack — Real estate call intelligence",
    description: "AI grades every call against The Four Pillars. Hot leads to acquisitions in seconds. realtrack.app",
    images: [`${SITE_URL}/og.png`],
  },
  category: "business",
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
};

// JSON-LD structured data — helps Google understand what RealTrack is and
// who's behind it. Includes Organization, SoftwareApplication, and FAQ.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "RealTrack",
      alternateName: ["realtrack.app", "RealTrack App"],
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      email: "info@realtrack.app",
      sameAs: [SITE_URL],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "RealTrack",
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "AI-powered call qualification and acquisitions OS for real estate wholesalers and call centers.",
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
      name: "RealTrack",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
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
