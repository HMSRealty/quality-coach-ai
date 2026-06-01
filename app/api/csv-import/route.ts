import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function getServiceClient(): SupabaseClient | { error: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return { error: "Missing NEXT_PUBLIC_SUPABASE_URL env var" };
  if (!key) return { error: "Missing SUPABASE_SERVICE_ROLE_KEY env var" };
  try {
    return createClient(url, key, { auth: { persistSession: false } });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to init Supabase client" };
  }
}

// Tolerant CSV parser — handles quoted fields, commas in quotes, CRLF
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); cur = []; field = ""; }
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else { field += c; }
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }

  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());

  return rows.slice(1).filter(r => r.some(v => v.trim() !== "")).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] || "").trim(); });
    return obj;
  });
}

export async function POST(req: NextRequest) {
  try {
    const client = getServiceClient();
    if ("error" in client) {
      return NextResponse.json({ error: client.error }, { status: 500 });
    }
    const supabase = client;

    // Accept both JSON body { csv, userId } and multipart/form-data { file, userId }
    let csv = "";
    let userId = "";
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      userId = String(form.get("userId") || "");
      if (file) csv = await file.text();
    } else {
      const body = await req.json().catch(() => ({}));
      csv = body.csv || "";
      userId = body.userId || "";
    }

    if (!csv) return NextResponse.json({ error: "Missing CSV content" }, { status: 400 });
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const rows = parseCSV(csv).map(r => ({
      manager:      r["manager"] || "",
      agent_name:   r["agent name"] || r["agent_name"] || "",
      team_name:    r["team name"] || r["team_name"] || "",
      trainer_name: r["trainer name"] || r["trainer_name"] || "",
      hiring_date:  r["hiring date"] || r["hiring_date"] || "",
    }));

    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV is empty or missing data rows" }, { status: 400 });
    }

    const stats = { rows: rows.length, teams: 0, callers: 0, trainers: 0, errors: [] as string[] };

    // 1) Teams
    const teams: Record<string, string> = {};
    for (const row of rows) {
      if (!row.team_name || teams[row.team_name]) continue;
      try {
        const { data: existing } = await supabase
          .from("teams").select("id")
          .eq("name", row.team_name).eq("manager_id", userId).maybeSingle();
        if (existing) { teams[row.team_name] = existing.id; continue; }

        const { data: created, error } = await supabase
          .from("teams").insert({ name: row.team_name, manager_id: userId })
          .select("id").single();
        if (error) { stats.errors.push(`team "${row.team_name}": ${error.message}`); continue; }
        if (created) { teams[row.team_name] = created.id; stats.teams++; }
      } catch (e) {
        stats.errors.push(`team "${row.team_name}": ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    // 2) Cold callers
    const callers: Record<string, string> = {};
    for (const row of rows) {
      if (!row.agent_name || callers[row.agent_name]) continue;
      try {
        const { data: existing } = await supabase
          .from("cold_callers").select("id")
          .eq("name", row.agent_name).eq("user_id", userId).maybeSingle();
        if (existing) { callers[row.agent_name] = existing.id; continue; }

        const { data: created, error } = await supabase
          .from("cold_callers").insert({
            name: row.agent_name,
            user_id: userId,
            team_id: row.team_name ? teams[row.team_name] || null : null,
            hiring_date: row.hiring_date || null,
          }).select("id").single();
        if (error) { stats.errors.push(`caller "${row.agent_name}": ${error.message}`); continue; }
        if (created) { callers[row.agent_name] = created.id; stats.callers++; }
      } catch (e) {
        stats.errors.push(`caller "${row.agent_name}": ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    // 3) Trainers
    const trainers: Record<string, string> = {};
    for (const row of rows) {
      if (!row.trainer_name || trainers[row.trainer_name]) continue;
      try {
        const { data: existing } = await supabase
          .from("trainers").select("id")
          .eq("name", row.trainer_name).eq("user_id", userId).maybeSingle();
        if (existing) { trainers[row.trainer_name] = existing.id; continue; }

        const { data: created, error } = await supabase
          .from("trainers").insert({
            name: row.trainer_name,
            user_id: userId,
            email: `${row.trainer_name.toLowerCase().replace(/\s+/g, ".")}@hms.local`,
          }).select("id").single();
        if (error) { stats.errors.push(`trainer "${row.trainer_name}": ${error.message}`); continue; }
        if (created) { trainers[row.trainer_name] = created.id; stats.trainers++; }
      } catch (e) {
        stats.errors.push(`trainer "${row.trainer_name}": ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    // Catch-all — guarantees JSON response, never HTML
    console.error("CSV import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    );
  }
}

// GET = health check so you can verify the route is reachable
export async function GET() {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  return NextResponse.json({
    ok: true,
    route: "/api/csv-import",
    env: { NEXT_PUBLIC_SUPABASE_URL: hasUrl, SUPABASE_SERVICE_ROLE_KEY: hasKey },
  });
}
