"use client";

// Shift Targets — driven by an uploaded matrix sheet. Upload a CSV, MAP its
// columns (Agent, Shift Type required, Daily Target optional), preview, then
// apply: sets each agent's shift type + daily target on cold_callers.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Target, Upload, ArrowRight, CheckCircle2, Loader2, Download, Pencil } from "lucide-react";

const SKY = "#3B82F6";
const SKY_600 = "#2563EB";
const MONEY = "#2563EB";

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { cur.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(f); rows.push(cur); cur = []; f = ""; }
    else f += c;
  }
  if (f.length || cur.length) { cur.push(f); rows.push(cur); }
  return rows.filter(r => r.some(c => c.trim()));
}
const normShift = (v: string) => {
  const s = (v || "").toLowerCase();
  if (s.includes("part") || s === "pt" || s === "1") return "part_time";
  if (s.includes("full") || s === "ft" || s === "2") return "full_time";
  return "full_time";
};

interface Caller { id: string; name: string; }

export default function ShiftTargetsPage() {
  const [grid, setGrid] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState({ name: -1, shift: -1, target: -1 });
  const [callers, setCallers] = useState<Caller[]>([]);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<{ updated: number; created: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
      const { data } = await supabase.from("cold_callers").select("id, name").eq("user_id", user.id);
      setCallers((data || []) as Caller[]);
    })();
  }, []);

  const header = grid[0] || [];
  const dataRows = grid.slice(1);

  const onFile = async (f: File) => {
    setFileName(f.name); setDone(null);
    const g = parseCsv(await f.text());
    setGrid(g);
    // Auto-guess columns.
    const h = (g[0] || []).map(x => x.trim().toLowerCase());
    const find = (cands: string[]) => h.findIndex(c => cands.some(k => c.includes(k)));
    setMap({
      name: find(["agent", "name", "caller", "employee"]),
      shift: find(["shift", "type"]),
      target: find(["target", "daily", "quota"]),
    });
  };

  const preview = useMemo(() => {
    if (map.name < 0 || map.shift < 0) return [];
    return dataRows.map(r => ({
      name: (r[map.name] || "").trim(),
      shift: normShift(r[map.shift] || ""),
      target: map.target >= 0 && r[map.target] ? Number(String(r[map.target]).replace(/[^\d.]/g, "")) : null,
    })).filter(r => r.name);
  }, [dataRows, map]);

  const apply = async () => {
    setApplying(true);
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { setApplying(false); return; }
    const byName = new Map(callers.map(c => [c.name.trim().toLowerCase(), c.id]));
    let updated = 0, created = 0;
    for (const r of preview) {
      const target = r.target ?? (r.shift === "part_time" ? 1 : 2);
      const id = byName.get(r.name.toLowerCase());
      if (id) { await supabase.from("cold_callers").update({ shift_type: r.shift, daily_target: target }).eq("id", id); updated++; }
      else { await supabase.from("cold_callers").insert({ user_id: user.id, name: r.name, shift_type: r.shift, daily_target: target }); created++; }
    }
    setApplying(false); setDone({ updated, created });
    const { data } = await supabase.from("cold_callers").select("id, name").eq("user_id", user.id);
    setCallers((data || []) as Caller[]);
  };

  const template = () => {
    const csv = "Agent Name,Shift Type,Daily Target\nJohn Smith,Full-time,2\nJane Doe,Part-time,1";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "shift-matrix-template.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const sel: React.CSSProperties = { padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border-2)", background: "#0A0A0E", color: "#F4F4FF", fontSize: 13, outline: "none" };
  const card: React.CSSProperties = { background: "#0A0A0E", border: "1px solid var(--border-2)", borderRadius: 16, padding: 20, boxShadow: "var(--shadow-sm)" };

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }} className="animate-in">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(59,130,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}><Target size={19} color={SKY_600} /></span>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#F4F4FF", letterSpacing: "-0.02em" }}>Shift Targets</h1>
          <p style={{ fontSize: 13, color: "var(--text-2)" }}>Upload the floor sheet → map columns → set every caller&apos;s shift &amp; daily quota in one shot.</p>
        </div>
      </div>

      {/* Step 1: upload */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#F4F4FF" }}>1 · Upload matrix CSV</p>
          <button onClick={template} className="btn-ghost" style={{ fontSize: 12 }}><Download size={12} /> Template</button>
        </div>
        <label style={{ border: "2px dashed color-mix(in srgb, #3B82F6 35%, transparent)", borderRadius: 14, padding: "24px 18px", textAlign: "center", cursor: "pointer", background: "#101018", display: "block" }}>
          <input type="file" accept=".csv" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} style={{ display: "none" }} />
          <Upload size={26} color="#2563EB" style={{ margin: "0 auto 8px" }} />
          <p style={{ fontSize: 14, fontWeight: 800, color: "#F4F4FF" }}>{fileName || "Click to choose a CSV"}</p>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>Must include an Agent column and a Shift Type column.</p>
        </label>
      </div>

      {/* Step 2: mapping */}
      {grid.length > 0 && (
        <div style={card}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#F4F4FF", marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 7 }}><Pencil size={15} color={SKY_600} /> 2 · Map columns</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {([["name", "Agent name *"], ["shift", "Shift type *"], ["target", "Daily target (optional)"]] as const).map(([k, label]) => (
              <div key={k}>
                <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)", display: "block", marginBottom: 5 }}>{label}</label>
                <select value={map[k]} onChange={e => setMap({ ...map, [k]: Number(e.target.value) })} style={{ ...sel, width: "100%" }}>
                  <option value={-1}>— none —</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: preview + apply */}
      {preview.length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#F4F4FF" }}>3 · Preview ({preview.length} agents)</p>
            <button onClick={apply} disabled={applying} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, background: "linear-gradient(135deg, #3B82F6, #2563EB)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: applying ? "wait" : "pointer" }}>
              {applying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Apply targets <ArrowRight size={14} />
            </button>
          </div>
          {done && <p style={{ fontSize: 13, fontWeight: 700, color: MONEY, marginBottom: 10 }}>✓ Updated {done.updated} · created {done.created} agents.</p>}
          <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border-2)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420, fontSize: 13 }}>
              <thead><tr style={{ background: "#101018" }}>
                {["Agent", "Shift", "Daily target"].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {preview.slice(0, 100).map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border-1)" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: "#F4F4FF" }}>{r.name}</td>
                    <td style={{ padding: "8px 12px", color: "var(--text-2)" }}>{r.shift === "part_time" ? "Part-time" : "Full-time"}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 800, color: SKY_600 }}>{r.target ?? (r.shift === "part_time" ? 1 : 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
