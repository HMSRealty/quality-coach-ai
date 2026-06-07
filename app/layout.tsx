import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono, Space_Grotesk } from "next/font/google";
import { SmoothScroll } from "@/app/_components/SmoothScroll";
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

export const metadata: Metadata = {
  title: {
    default: "RealTrack",
    template: "%s · RealTrack",
  },
  description:
    "Enterprise outbound real estate platform. Run teams, track KPIs, score every call, and scale revenue.",
  keywords: ["real estate outbound", "cold calling", "team management", "call analytics", "lead intake"],
};

export const viewport: Viewport = {
  themeColor: "#0B0F1F",
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
      </body>
    </html>
  );
}
