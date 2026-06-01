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

    // ── De-dupe inputs ───────────────────────────────────────
    const uniqueTeamNames    = Array.from(new Set(rows.map(r => r.team_name).filter(Boolean)));
    const uniqueTrainerNames = Array.from(new Set(rows.map(r => r.trainer_name).filter(Boolean)));
    const uniqueCallers      = Array.from(new Map(
      rows
        .filter(r => r.agent_name)
        .map(r => [r.agent_name, { name: r.agent_name, team_name: r.team_name, hiring_date: r.hiring_date }] as const)
    ).values());

    const stats = { rows: rows.length, teams: 0, callers: 0, trainers: 0, errors: [] as string[] };

    // ── 1) TEAMS: one SELECT for existing, one bulk INSERT for new ──
    const teamIdByName: Record<string, string> = {};
    if (uniqueTeamNames.length) {
      const { data: existingTeams, error: selErr } = await supabase
        .from("teams")
        .select("id, name")
        .eq("manager_id", userId)
        .in("name", uniqueTeamNames);
      if (selErr) {
        return NextResponse.json({ error: `Reading teams failed: ${selErr.message}` }, { status: 500 });
      }
      (existingTeams || []).forEach(t => { teamIdByName[t.name] = t.id; });

      const toInsert = uniqueTeamNames
        .filter(n => !teamIdByName[n])
        .map(n => ({ name: n, manager_id: userId }));
      if (toInsert.length) {
        const { data: inserted, error: insErr } = await supabase
          .from("teams").insert(toInsert).select("id, name");
        if (insErr) {
          stats.errors.push(`Bulk team insert: ${insErr.message}`);
        } else {
          (inserted || []).forEach(t => { teamIdByName[t.name] = t.id; });
          stats.teams = inserted?.length || 0;
        }
      }
    }

    // ── 2) TRAINERS: one SELECT, one bulk INSERT ──
    const trainerIdByName: Record<string, string> = {};
    if (uniqueTrainerNames.length) {
      const { data: existingTrainers, error: selErr } = await supabase
        .from("trainers")
        .select("id, name")
        .eq("user_id", userId)
        .in("name", uniqueTrainerNames);
      if (selErr) {
        stats.errors.push(`Reading trainers: ${selErr.message}`);
      } else {
        (existingTrainers || []).forEach(t => { trainerIdByName[t.name] = t.id; });

        const toInsert = uniqueTrainerNames
          .filter(n => !trainerIdByName[n])
          .map(n => ({
            name: n,
            user_id: userId,
            email: `${n.toLowerCase().replace(/\s+/g, ".")}@hms.local`,
          }));
        if (toInsert.length) {
          const { data: inserted, error: insErr } = await supabase
            .from("trainers").insert(toInsert).select("id, name");
          if (insErr) {
            stats.errors.push(`Bulk trainer insert: ${insErr.message}`);
          } else {
            (inserted || []).forEach(t => { trainerIdByName[t.name] = t.id; });
            stats.trainers = inserted?.length || 0;
          }
        }
      }
    }

    // ── 3) COLD CALLERS: one SELECT, one bulk INSERT ──
    const callerNames = uniqueCallers.map(c => c.name);
    const callerIdByName: Record<string, string> = {};
    if (callerNames.length) {
      const { data: existingCallers, error: selErr } = await supabase
        .from("cold_callers")
        .select("id, name")
        .eq("user_id", userId)
        .in("name", callerNames);
      if (selErr) {
        stats.errors.push(`Reading callers: ${selErr.message}`);
      } else {
        (existingCallers || []).forEach(c => { callerIdByName[c.name] = c.id; });

        const toInsert = uniqueCallers
          .filter(c => !callerIdByName[c.name])
          .map(c => ({
            name: c.name,
            user_id: userId,
            team_id: c.team_name ? teamIdByName[c.team_name] || null : null,
            hiring_date: c.hiring_date || null,
          }));
        if (toInsert.length) {
          const { data: inserted, error: insErr } = await supabase
            .from("cold_callers").insert(toInsert).select("id, name");
          if (insErr) {
            stats.errors.push(`Bulk caller insert: ${insErr.message}`);
          } else {
            (inserted || []).forEach(c => { callerIdByName[c.name] = c.id; });
            stats.callers = inserted?.length || 0;
          }
        }
      }
    }

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("CSV import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    );
  }
}

// GET = health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/csv-import",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
}
