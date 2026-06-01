// Forces this dynamic route onto the Edge runtime — required by
// @cloudflare/next-on-pages. The page itself is a client component
// and can't carry route-segment config, so we declare it on the layout.

export const runtime = "edge";

export default function LeadDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
