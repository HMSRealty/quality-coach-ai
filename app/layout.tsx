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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://realtrack.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RealTrack — Real Estate Call Intelligence & Acquisitions OS",
    template: "%s · RealTrack",
  },
  description:
    "RealTrack listens to your cold calls, qualifies leads against live market data, computes ARV & MAO, and routes deals to acquisitions — the operating system for real-estate call centers.",
  keywords: ["real estate wholesaling", "cold calling QA", "call analytics", "ARV calculator", "MAO calculator", "acquisitions CRM", "lead intake"],
  applicationName: "RealTrack",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "RealTrack",
    url: SITE_URL,
    title: "RealTrack — Real Estate Call Intelligence & Acquisitions OS",
    description: "Qualify every call, compute ARV & MAO, and route deals to acquisitions — automatically.",
  },
  twitter: {
    card: "summary_large_image",
    title: "RealTrack",
    description: "Real estate call intelligence & acquisitions OS.",
  },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body>
        <SmoothScroll />
        {children}
        <Toaster position="bottom-right" expand gap={10} toastOptions={{ unstyled: true }} />
      </body>
    </html>
  );
}
