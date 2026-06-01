import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "WinnerCoach — Quality & Coaching",
    template: "%s · WinnerCoach",
  },
  description:
    "WinnerCoach: outbound quality assurance and coaching platform. Run teams, track KPIs, score every call.",
  keywords: ["cold calling", "call coaching", "quality assurance", "team management", "call analytics"],
};

export const viewport: Viewport = {
  themeColor: "#0038B8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
