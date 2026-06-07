"use client";

// Payroll & Accounting — period production ledger.
// Production points (Hot 1 · Warm 1 · Cold 0.5) × an editable bonus rate, with
// per-agent target attainment. Read-only/estimating tool; no money is moved.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { T } from "@/app/_components/tokens";
import { Loader2, Wallet, Download, Calculator } from "lucide-react";

const NAVY = T.text1;
const SLATE = T.text2;

const POINTS: Record<string, number> = { hot: 1, warm: 1, cold: 0.5 };
const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");

function estDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}
function estShift(days: number): string {
  return estDate(new Date(Date.now() + days * 86_400_000));
}

const RANGES = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
] as const;

type Row = {
  name: string;
  hot: number; warm: number; cold: number; qualified: number; total: number;
  points: number;
  dailyTarget: number; dayCount: number; targetTotal: number; pacePct: number;
  bonus: number;
};

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function PayrollPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [rate, setRate] = useState(25); // bonus $ per production point

  const load = useCallback(async (d: number, r: number) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const from = estShift(-(d - 1));
    const to = estDate();
    const { data } = await supabase.from("leads")
      .select("agent_name, status, submission_date")
      .gte("submission_date", from).lte("submission_date", to);

    const { data: ag } = await supabase.from("cold_callers")
      .select("name, daily_target, shift_type")
      .eq("user_id", user.id);
    const targetByName = new Map<string, number>();
    (ag || []).forEach((a: { name: string | null; daily_target: number | null; shift_type: string | null }) => {
      if (!a.name) return;
      const t = typeof a.daily_target === "number" ? a.daily_target : (a.shift_type === "part_time" ? 1 : 2);
      targetByName.set(a.name.trim(), t);
    });

    type LR = { agent_name: string | null; status: string; submission_date: string | null };
    const map = new Map<string, Row>();
    const activeDays = new Map<string, Set<string>>();

    for (const l of (data || []) as LR[]) {
      const name = l.agent_name?.trim() || "Unassigned";
      const row = map.get(name) || {
        name, hot: 0, warm: 0, cold: 0, qualified: 0, total: 0, points: 0,
        dailyTarget: targetByName.get(name) ?? 2, dayCount: 0, targetTotal: 0, pacePct: 0, bonus: 0,
      };
      row.total++;
      const s = norm(l.status);
      if (s === "hot") row.hot++;
      else if (s === "warm") row.warm++;
      else if (s === "cold") row.cold++;
      row.points += POINTS[s] || 0;
      if (l.submission_date) {
        const set = activeDays.get(name) || new Set<string>();
        set.add(l.submission_date);
        activeDays.set(name, set);
      }
      map.set(name, row);
    }
    const out = [...map.values()].map((row) => {
      row.qualified = row.hot + row.warm + row.cold;
      row.dayCount = activeDays.get(row.name)?.size || 0;
      row.targetTotal = row.dailyTarget * (row.dayCount || d);
      row.pacePct = row.targetTotal > 0 ? Math.round((row.points / row.targetTotal) * 100) : 0;
      row.bonus = row.points * r;
      return row;
    }).sort((a, b) => b.bonus - a.bonus);
    setRows(out);
    setLoading(false);
  }, []);

  useEffect(() => { load(days, rate); }, [load, days, rate]);

  const totals = rows.reduce((acc, r) => ({
    points: acc.points + r.points, bonus: acc.bonus + r.bonus,
    qualified: acc.qualified + r.qualified, total: acc.total + r.total,
  }), { points: 0, bonus: 0, qualified: 0, total: 0 });

  const exportCSV = () => {
    const headers = ["Agent", "Calls", "Hot", "Warm", "Cold", "Qualified", "Points", "Target", "Attainment %", "Bonus"];
    const body = rows.map(r => [r.name, r.total, r.hot, r.warm, r.cold, r.qualified, r.points, r.targetTotal, r.pacePct, Math.round(r.bonus)]);
    const csv = [headers, ...body].map(line => line.map(c => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `payroll-${days}d-${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const th = { padding: "11px 14px", textAlign: "left" as const, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const };
  const td = { padding: "12px 14px", fontSize: 13, color: NAVY, whiteSpace: "nowrap" as const };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }} className="animate-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
            <Wallet size={26} color={T.purple} /> Payroll &amp; Accounting
          </h1>
          <p style={{ fontSize: 13, color: SLATE, marginTop: 4 }}>
            Production-based bonus ledger. Last {days} days · EST. Estimates only — no payments are processed here.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setDays(r.days)} className={days === r.days ? "btn-brand" : "btn-ghost"} style={{ padding: "8px 16px", fontSize: 12 }}>
              {r.label}
            </button>
          ))}
          <button onClick={exportCSV} className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }}>
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* Summary band + rate control */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        <SummaryCard label="Total bonus (period)" value={money(totals.bonus)} accent="#10B981" />
        <SummaryCard label="Production points" value={String(Math.round(totals.points * 10) / 10)} accent={T.purple as string} />
        <SummaryCard label="Qualified / Calls" value={`${totals.qualified} / ${totals.total}`} accent="#0284C7" />
        <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 14, padding: "14px 16px", boxShadow: "var(--shadow-sm)" }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase", marginBottom: 8 }}>
            <Calculator size={11} style={{ display: "inline", marginRight: 4 }} /> Bonus rate / point
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: NAVY }}>$</span>
            <input type="number" min={0} step={1} value={rate}
              onChange={e => setRate(Math.max(0, Number(e.target.value) || 0))}
              style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--surface-3)", color: NAVY, fontSize: 16, fontWeight: 800, outline: "none" }} />
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: "center" }}><Loader2 size={28} className="animate-spin" style={{ color: T.purple }} /></div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", background: "var(--surface-1)", borderRadius: 18, border: "1px solid var(--border-2)" }}>
          <Wallet size={36} color="#CBD5E1" style={{ margin: "0 auto 10px" }} />
          <p style={{ fontSize: 14, color: SLATE }}>No production in this range yet.</p>
        </div>
      ) : (
        <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
          <div data-lenis-prevent="true" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr style={{ background: "var(--surface-3)" }}>
                  <th style={th}>Agent</th>
                  <th style={{ ...th, textAlign: "center" }}>Calls</th>
                  <th style={{ ...th, textAlign: "center" }}>Hot</th>
                  <th style={{ ...th, textAlign: "center" }}>Warm</th>
                  <th style={{ ...th, textAlign: "center" }}>Cold</th>
                  <th style={{ ...th, textAlign: "center" }}>Points</th>
                  <th style={{ ...th, textAlign: "center" }}>Attainment</th>
                  <th style={{ ...th, textAlign: "right" }}>Bonus</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} style={{ borderTop: "1px solid var(--border-1)" }}>
                    <td style={{ ...td, fontWeight: 700 }}>{r.name}</td>
                    <td style={{ ...td, textAlign: "center", color: SLATE }}>{r.total}</td>
                    <td style={{ ...td, textAlign: "center", color: "#DC2626", fontWeight: 700 }}>{r.hot}</td>
                    <td style={{ ...td, textAlign: "center", color: "#EA580C", fontWeight: 700 }}>{r.warm}</td>
                    <td style={{ ...td, textAlign: "center", color: "#0284C7", fontWeight: 700 }}>{r.cold}</td>
                    <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>{Math.round(r.points * 10) / 10}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <span style={{
                        padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 800,
                        background: r.pacePct >= 100 ? "rgba(16,185,129,0.12)" : r.pacePct >= 80 ? "var(--surface-3)" : "rgba(234,88,12,0.12)",
                        color: r.pacePct >= 100 ? "#10B981" : r.pacePct >= 80 ? "var(--text-2)" : "#EA580C",
                      }}>{r.pacePct}%</span>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 900, color: "#10B981" }}>{money(r.bonus)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border-2)", background: "var(--surface-3)" }}>
                  <td style={{ ...td, fontWeight: 900 }}>Total</td>
                  <td style={{ ...td, textAlign: "center", color: SLATE }}>{totals.total}</td>
                  <td colSpan={3} />
                  <td style={{ ...td, textAlign: "center", fontWeight: 900 }}>{Math.round(totals.points * 10) / 10}</td>
                  <td />
                  <td style={{ ...td, textAlign: "right", fontWeight: 900, color: "#10B981" }}>{money(totals.bonus)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-2)", borderRadius: 14, padding: "14px 16px", boxShadow: "var(--shadow-sm)", borderTop: `3px solid ${accent}` }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-3)", textTransform: "uppercase", marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.02em" }}>{value}</p>
    </div>
  );
}
