// Shared helpers for CSV export endpoints.
// CSV-quoting follows RFC 4180 — every cell wrapped in double quotes, embedded
// quotes doubled. Excel/Sheets-friendly UTF-8 BOM prefix so non-ASCII chars
// (Arabic owner names, accented street names) render correctly.

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : (typeof v === "object" ? JSON.stringify(v) : String(v));
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

const BOM = "﻿";

export function csvResponse(headers: string[], rows: unknown[][], filename: string): Response {
  const body = BOM + [csvRow(headers), ...rows.map(csvRow)].join("\n");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // Allows =IMPORTDATA() to pull cleanly without CORS issues.
      "Access-Control-Allow-Origin": "*",
      // Hint browsers that this can be downloaded as a file when hit directly.
      "Content-Disposition": `inline; filename="${filename}"`,
      // Keep Sheets fresh — cache 5 minutes so repeated IMPORTDATA calls don't
      // hammer Supabase, but the data is never more than 5 min stale.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

// SHA-256 helper for api_keys lookup. Matches the hash format used by
// /api/inbound/lead.
export async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Resolves a request to a user_id via an api_key (header or ?key=).
// Returns null if unauthorized. Caller decides how to respond.
export async function resolveApiKey(
  sb: { from: (t: string) => { select: (cols: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: { user_id: string; revoked: boolean } | null }> } } } },
  req: Request,
): Promise<string | null> {
  const url = new URL(req.url);
  const token = ((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
    || url.searchParams.get("key") || "").trim();
  if (!token) return null;
  const hash = await sha256hex(token);
  const { data } = await sb.from("api_keys")
    .select("user_id, revoked")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!data || data.revoked) return null;
  return data.user_id;
}
