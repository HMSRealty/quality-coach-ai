"use client";

export const runtime = "edge";

// Skip Tracing — built into RealTrack. Two modes:
//   • Single — one owner, instant result card.
//   • Batch  — paste rows or upload a CSV, traced in chunks with live
//     progress, results in a table, one-click CSV export.
// The paid gate is enforced server-side; the UI only mirrors it.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  UserSearch, Loader2, Phone, Mail, CheckCircle2, Lock, Search, Copy,
  AlertCircle, Upload, Download, ListChecks, User, XCircle, StopCircle,
} from "lucide-react";

const NAVY = "#15131D";
const SLATE = "#6B6880";
const BLUE = "#2563EB";
const GRAD = "linear-gradient(120deg,#6B3FA0,#3B82F6)";

// ── Types ────────────────────────────────────────────────────────────────

interface TraceRow {
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

type RowStatus = "pending" | "tracing" | "found" | "no-match" | "error";

interface BatchRow extends TraceRow {
  status: RowStatus;
  matchedName?: string;
  primaryPhone?: string;
  otherPhones?: string[];
  email?: string;
  error?: string;
}

interface SingleResult {
  found: boolean;
  matchedName?: string;
  primaryPhone?: string;
  otherPhones?: string[];
  email?: string;
}

const CHUNK_SIZE = 10;   // must match the batch API's CHUNK_MAX
const BATCH_LIMIT = 500; // sanity cap per run

// ── CSV / paste parsing ──────────────────────────────────────────────────

/** Split one CSV line honoring double-quoted cells. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Map flexible header names to our fields. */
function headerIndex(headers: string[]) {
  const norm = headers.map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const find = (...names: string[]) => norm.findIndex((h) => names.includes(h));
  return {
    first: find("firstname", "first", "fname"),
    last: find("lastname", "last", "lname", "surname"),
    name: find("name", "fullname", "owner", "ownername"),
    street: find("street", "address", "streetaddress", "propertyaddress", "addr"),
    city: find("city", "town"),
    state: find("state", "st"),
    zip: find("zip", "zipcode", "postal", "postalcode"),
  };
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/**
 * Parse pasted text or CSV content into rows.
 * With a header row, columns are mapped by name. Without one, each line is
 * read as: First Last, Street, City, State, Zip (street optional when only
 * four parts are present).
 */
function parseRows(text: string): { rows: TraceRow[]; skipped: number } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], skipped: 0 };

  const rows: TraceRow[] = [];
  let skipped = 0;

  const maybeHeader = splitCsvLine(lines[0]);
  const idx = headerIndex(maybeHeader);
  // A row is traceable with a full name OR just a street address (+ city/state).
  const usable = (r: TraceRow) => !!r.city && !!r.state && ((!!r.firstName && !!r.lastName) || !!r.street);
  const hasHeader = idx.name >= 0 || (idx.first >= 0 && idx.last >= 0) || (idx.street >= 0 && idx.city >= 0);

  if (hasHeader) {
    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      const get = (i: number) => (i >= 0 && i < cells.length ? cells[i] : "");
      let firstName = get(idx.first), lastName = get(idx.last);
      if (!firstName && idx.name >= 0) ({ firstName, lastName } = splitName(get(idx.name)));
      const row: TraceRow = {
        firstName, lastName,
        street: get(idx.street), city: get(idx.city), state: get(idx.state), zip: get(idx.zip),
      };
      if (usable(row)) rows.push(row);
      else skipped++;
    }
  } else {
    for (const line of lines) {
      const cells = splitCsvLine(line);
      if (cells.length < 3) { skipped++; continue; }
      // Lines starting with a house number are address-only:
      //   123 Main St, Dallas, TX[, 75201]
      // otherwise the first cell is the owner name:
      //   John Smith[, 123 Main St], Dallas, TX[, 75201]
      let row: TraceRow;
      if (/^\d/.test(cells[0])) {
        row = { firstName: "", lastName: "", street: cells[0], city: cells[1], state: cells[2], zip: cells[3] || "" };
      } else if (cells.length >= 5) {
        const { firstName, lastName } = splitName(cells[0]);
        row = { firstName, lastName, street: cells[1], city: cells[2], state: cells[3], zip: cells[4] || "" };
      } else if (cells.length === 4) {
        const { firstName, lastName } = splitName(cells[0]);
        row = { firstName, lastName, street: "", city: cells[1], state: cells[2], zip: cells[3] || "" };
      } else { skipped++; continue; }
      if (usable(row)) rows.push(row);
      else skipped++;
    }
  }
  return { rows: rows.slice(0, BATCH_LIMIT), skipped };
}

// ── CSV export ───────────────────────────────────────────────────────────

function exportCsv(rows: BatchRow[]) {
  const cell = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
  const head = ["First Name", "Last Name", "Street", "City", "State", "Zip", "Status", "Matched Name", "Primary Phone", "Other Phones", "Email"];
  const body = rows.map((r) => [
    r.firstName, r.lastName, r.street, r.city, r.state, r.zip,
    r.status === "found" ? "Found" : r.status === "no-match" ? "No match" : r.status === "error" ? `Error: ${r.error || ""}` : "Not run",
    r.matchedName || "", r.primaryPhone || "", (r.otherPhones || []).join(" / "), r.email || "",
  ].map(cell).join(","));
  const blob = new Blob(["﻿" + [head.map(cell).join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `skip-trace-results-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Shared UI bits ───────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 9,
  border: "1px solid var(--border-2)", background: "#FFFFFF",
  color: NAVY, fontSize: 14, outline: "none",
};
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.05em", color: "var(--text-3)", marginBottom: 5, display: "block",
};
const card: React.CSSProperties = {
  background: "#FFFFFF", border: "1px solid var(--border-2)",
  borderRadius: 14, padding: 22, boxShadow: "var(--shadow-sm)",
};

function CopyBtn({ value, size = 14 }: { value: string; size?: number }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { try { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); } catch {} }}
      title="Copy"
      style={{ background: "none", border: "none", cursor: "pointer", color: done ? "#059669" : BLUE, padding: 4, display: "inline-flex" }}
    >
      {done ? <CheckCircle2 size={size} /> : <Copy size={size} />}
    </button>
  );
}

const STATUS_CHIP: Record<RowStatus, { label: string; bg: string; fg: string }> = {
  "pending":  { label: "Pending",   bg: "#F1F2F8",                 fg: SLATE },
  "tracing":  { label: "Tracing…",  bg: "rgba(59,130,246,0.10)",   fg: BLUE },
  "found":    { label: "Found",     bg: "#ECFDF5",                 fg: "#059669" },
  "no-match": { label: "No match",  bg: "rgba(245,158,11,0.12)",   fg: "#B45309" },
  "error":    { label: "Error",     bg: "rgba(225,29,72,0.08)",    fg: "#E11D48" },
};

// ── Page ─────────────────────────────────────────────────────────────────

export default function SkipTracingPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [paid, setPaid] = useState(false);
  const [mode, setMode] = useState<"single" | "batch">("single");

  // Single mode
  const [form, setForm] = useState<TraceRow>({ firstName: "", lastName: "", street: "", city: "", state: "", zip: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SingleResult | null>(null);
  const [error, setError] = useState("");

  // Batch mode
  const [pasteText, setPasteText] = useState("");
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [skippedInfo, setSkippedInfo] = useState(0);
  const [running, setRunning] = useState(false);
  const [batchError, setBatchError] = useState("");
  const cancelRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthed(false); return; }
      setAuthed(true);
      const { data } = await supabase.from("profiles")
        .select("is_approved, payment_status, plan_tier").eq("id", user.id).maybeSingle();
      const ok = data?.is_approved === true && (data?.payment_status === "paid" || (data?.plan_tier && data.plan_tier !== "free"));
      setPaid(!!ok);
    })();
  }, []);

  const authHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` };
  };

  // ── Single lookup ──
  const runSingle = async () => {
    setError(""); setResult(null);
    const hasName = form.firstName.trim() && form.lastName.trim();
    const hasAddress = form.street.trim();
    if ((!hasName && !hasAddress) || !form.city.trim() || !form.state.trim()) {
      setError("Enter an owner name (first + last) or a street address — plus city and state."); return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/propytrace/lookup", { method: "POST", headers: await authHeader(), body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Lookup failed"); return; }
      setResult({ found: !!j.found, matchedName: j.matchedName, primaryPhone: j.primaryPhone, otherPhones: j.otherPhones, email: j.email });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  // ── Batch: load rows from paste/file ──
  const loadRows = (text: string) => {
    setBatchError("");
    const { rows, skipped } = parseRows(text);
    setSkippedInfo(skipped);
    if (!rows.length) { setBatchRows([]); setBatchError("No usable rows found. Each row needs an owner name or a street address, plus city and state."); return; }
    setBatchRows(rows.map((r) => ({ ...r, status: "pending" as RowStatus })));
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => loadRows(String(reader.result || ""));
    reader.readAsText(f);
  };

  // ── Batch: run in chunks ──
  const runBatch = async () => {
    if (!batchRows.length || running) return;
    setRunning(true); setBatchError(""); cancelRef.current = false;

    const headers = await authHeader();
    // Reset any previous outcomes so re-runs start clean.
    setBatchRows((rows) => rows.map((r) => ({ ...r, status: "pending" as RowStatus, error: undefined })));

    for (let start = 0; start < batchRows.length; start += CHUNK_SIZE) {
      if (cancelRef.current) break;
      const end = Math.min(start + CHUNK_SIZE, batchRows.length);
      setBatchRows((rows) => rows.map((r, i) => (i >= start && i < end ? { ...r, status: "tracing" } : r)));

      const items = batchRows.slice(start, end).map(({ firstName, lastName, street, city, state, zip }) =>
        ({ firstName, lastName, street, city, state, zip }));

      try {
        const r = await fetch("/api/propytrace/batch", { method: "POST", headers, body: JSON.stringify({ items }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Batch failed (${r.status})`);
        const results = (j.results || []) as Array<{ found: boolean; matchedName: string; primaryPhone: string; otherPhones: string[]; email: string; error?: string }>;
        setBatchRows((rows) => rows.map((row, i) => {
          if (i < start || i >= end) return row;
          const res = results[i - start];
          if (!res) return { ...row, status: "error", error: "No result returned" };
          if (res.error) return { ...row, status: "error", error: res.error };
          return {
            ...row,
            status: res.found ? "found" : "no-match",
            matchedName: res.matchedName, primaryPhone: res.primaryPhone,
            otherPhones: res.otherPhones, email: res.email,
          };
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Batch failed";
        setBatchRows((rows) => rows.map((row, i) => (i >= start && i < end ? { ...row, status: "error", error: msg } : row)));
        // Auth/paid failures will repeat on every chunk — stop the run.
        if (/unauthorized|paid feature|configured/i.test(msg)) { setBatchError(msg); break; }
      }
    }

    setRunning(false);
  };

  const done = useMemo(() => batchRows.filter((r) => r.status === "found" || r.status === "no-match" || r.status === "error").length, [batchRows]);
  const foundCount = useMemo(() => batchRows.filter((r) => r.status === "found").length, [batchRows]);
  const progress = batchRows.length ? Math.round((done / batchRows.length) * 100) : 0;

  if (authed === null) {
    return <div style={{ padding: 80, textAlign: "center" }}><Loader2 size={28} className="animate-spin" style={{ color: BLUE }} /></div>;
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }} className="animate-in">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
          <UserSearch size={26} color={BLUE} /> Skip Tracing
        </h1>
        <p style={{ fontSize: 14, color: SLATE, marginTop: 4 }}>
          Trace by owner name, by address alone, or both — best phone, matched name, and email out. One owner or a whole list.
        </p>
      </div>

      {/* Paid gate */}
      {!paid && (
        <div style={{ background: "rgba(245,158,11,0.10)", border: "1px solid #FDE68A", borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Lock size={18} color="#B45309" />
            <p style={{ fontSize: 15, fontWeight: 800, color: "#B45309" }}>Skip tracing is a paid feature</p>
          </div>
          <p style={{ fontSize: 13, color: "#713F12", lineHeight: 1.6, marginBottom: 14 }}>
            Single and batch tracing are included on paid plans. Upgrade to activate it for your workspace.
          </p>
          <a href="mailto:info@realtrack.app?subject=Upgrade%20for%20skip-tracing%20access" style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 9,
            textDecoration: "none", background: GRAD, color: "#fff", fontSize: 13, fontWeight: 700,
          }}>
            Contact us to upgrade
          </a>
        </div>
      )}

      {/* Mode switch */}
      <div style={{ display: "flex", gap: 6, background: "#F1F2F8", border: "1px solid var(--border-2)", borderRadius: 12, padding: 4, width: "fit-content" }}>
        {([["single", "Single lookup", User], ["batch", "Batch trace", ListChecks]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setMode(id)} style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px",
            borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
            background: mode === id ? GRAD : "transparent", color: mode === id ? "#fff" : SLATE,
            transition: "all 140ms ease",
          }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── SINGLE ── */}
      {mode === "single" && (
        <>
          <div style={{ ...card, opacity: paid ? 1 : 0.6, pointerEvents: paid ? "auto" : "none" }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 4, display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Search size={15} color={BLUE} /> Run a lookup
            </p>
            <p style={{ fontSize: 12.5, color: SLATE, marginBottom: 14 }}>
              Search by owner name, by street address alone, or both — city and state are always required.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div><label style={lbl}>First name</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="John" style={inp} /></div>
              <div><label style={lbl}>Last name</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Smith" style={inp} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Street address {(!form.firstName.trim() || !form.lastName.trim()) ? "*" : ""}</label><input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} placeholder="123 Main St" style={inp} /></div>
              <div><label style={lbl}>City *</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Dallas" style={inp} /></div>
              <div><label style={lbl}>State *</label><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="TX" style={inp} /></div>
              <div><label style={lbl}>ZIP</label><input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} placeholder="75201" style={inp} /></div>
            </div>

            {error && (
              <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(225,29,72,0.08)", border: "1px solid #FECACA", color: "#DC2626", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button onClick={runSingle} disabled={loading || !paid} style={{
              marginTop: 16, padding: "11px 22px", borderRadius: 10, border: "none",
              background: loading ? "#D7DAE6" : GRAD, color: "#fff", fontSize: 14, fontWeight: 800,
              cursor: loading ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 7,
            }}>
              {loading ? <><Loader2 size={14} className="animate-spin" /> Searching…</> : <><Search size={14} /> Find owner contact</>}
            </button>
          </div>

          {result && (
            <div style={{
              background: result.found ? "#F0FDF4" : "#F1F2F8",
              border: `1px solid ${result.found ? "#A7F3D0" : "var(--border-2)"}`,
              borderRadius: 14, padding: 22,
            }}>
              {result.found ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <CheckCircle2 size={18} color="#059669" />
                    <p style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>Match found</p>
                  </div>
                  {result.matchedName && (
                    <p style={{ fontSize: 13, color: SLATE, marginBottom: 12 }}>Matched name: <strong style={{ color: NAVY }}>{result.matchedName}</strong></p>
                  )}
                  {result.primaryPhone && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#FFFFFF", border: "1px solid var(--border-1)", marginBottom: 8 }}>
                      <Phone size={16} color="#059669" />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: SLATE, letterSpacing: "0.05em", textTransform: "uppercase" }}>Primary phone</p>
                        <p style={{ fontSize: 16, fontWeight: 800, color: NAVY, fontFamily: "var(--font-mono)" }}>{result.primaryPhone}</p>
                      </div>
                      <CopyBtn value={result.primaryPhone} />
                    </div>
                  )}
                  {!!result.otherPhones?.length && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {result.otherPhones.map((p, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#FFFFFF", border: "1px solid var(--border-1)" }}>
                          <Phone size={13} color={SLATE} />
                          <p style={{ fontSize: 13, color: NAVY, fontFamily: "var(--font-mono)", flex: 1 }}>{p}</p>
                          <CopyBtn value={p} size={12} />
                        </div>
                      ))}
                    </div>
                  )}
                  {result.email && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "#FFFFFF", border: "1px solid var(--border-1)", marginTop: 8 }}>
                      <Mail size={14} color={SLATE} />
                      <p style={{ fontSize: 12.5, color: NAVY, flex: 1, wordBreak: "break-all" }}>{result.email}</p>
                      <CopyBtn value={result.email} size={12} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 6 }}>No match found</p>
                  <p style={{ fontSize: 12.5, color: SLATE, lineHeight: 1.6 }}>
                    We couldn&apos;t find a confident match for that name + address. Double-check the spelling, add the street
                    address if you skipped it, or run it through a batch — retries sometimes surface owners a single pass misses.
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ── BATCH ── */}
      {mode === "batch" && (
        <>
          <div style={{ ...card, opacity: paid ? 1 : 0.6, pointerEvents: paid ? "auto" : "none" }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 4, display: "inline-flex", alignItems: "center", gap: 7 }}>
              <ListChecks size={15} color={BLUE} /> Load your list
            </p>
            <p style={{ fontSize: 12.5, color: SLATE, marginBottom: 14, lineHeight: 1.6 }}>
              Upload a CSV (columns like <code>first name, last name, street, city, state, zip</code> — a single <code>name</code> column also works,
              and name columns are optional when a street address is present), or paste rows below as <code>Name, Street, City, State, Zip</code>.
              Rows that start with a house number are traced by <strong>address only</strong>. Up to {BATCH_LIMIT} rows per run.
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" style={{ display: "none" }}
                onChange={(e) => { onFile(e.target.files?.[0] || null); e.target.value = ""; }} />
              <button onClick={() => fileRef.current?.click()} disabled={running} style={{
                display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 9,
                border: "1px solid var(--border-2)", background: "#FFFFFF", color: NAVY, fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}>
                <Upload size={14} color={BLUE} /> Upload CSV
              </button>
              <button onClick={() => loadRows(pasteText)} disabled={running || !pasteText.trim()} style={{
                display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 9,
                border: "1px solid var(--border-2)", background: "#FFFFFF", color: NAVY, fontSize: 13, fontWeight: 700,
                cursor: pasteText.trim() ? "pointer" : "not-allowed", opacity: pasteText.trim() ? 1 : 0.55,
              }}>
                <ListChecks size={14} color={BLUE} /> Parse pasted rows
              </button>
            </div>

            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} disabled={running}
              placeholder={"John Smith, 123 Main St, Dallas, TX, 75201\nMary Johnson, 45 Oak Ave, Austin, TX, 78701"}
              style={{ ...inp, minHeight: 92, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 12.5 }} />

            {batchError && (
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(225,29,72,0.08)", border: "1px solid #FECACA", color: "#DC2626", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                <AlertCircle size={14} /> {batchError}
              </div>
            )}
            {skippedInfo > 0 && !batchError && (
              <p style={{ marginTop: 10, fontSize: 12, color: "#B45309", fontWeight: 600 }}>
                {skippedInfo} row{skippedInfo === 1 ? "" : "s"} skipped (need a name or street address, plus city and state).
              </p>
            )}
          </div>

          {batchRows.length > 0 && (
            <div style={card}>
              {/* Run bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                {!running ? (
                  <button onClick={runBatch} disabled={!paid} style={{
                    padding: "11px 22px", borderRadius: 10, border: "none", background: GRAD, color: "#fff",
                    fontSize: 14, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7,
                  }}>
                    <Search size={14} /> Trace {batchRows.length} row{batchRows.length === 1 ? "" : "s"}
                  </button>
                ) : (
                  <button onClick={() => { cancelRef.current = true; }} style={{
                    padding: "11px 22px", borderRadius: 10, border: "1px solid #FECACA", background: "#FFFFFF", color: "#DC2626",
                    fontSize: 14, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7,
                  }}>
                    <StopCircle size={14} /> Stop after this chunk
                  </button>
                )}
                <button onClick={() => exportCsv(batchRows)} disabled={done === 0} style={{
                  padding: "10px 16px", borderRadius: 9, border: "1px solid var(--border-2)", background: "#FFFFFF",
                  color: done ? NAVY : SLATE, fontSize: 13, fontWeight: 700, cursor: done ? "pointer" : "not-allowed",
                  display: "inline-flex", alignItems: "center", gap: 7, opacity: done ? 1 : 0.55,
                }}>
                  <Download size={14} color={BLUE} /> Export results CSV
                </button>
                <div style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: SLATE }}>
                  {done}/{batchRows.length} traced · <span style={{ color: "#059669" }}>{foundCount} found</span>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 7, borderRadius: 4, background: "#F1F2F8", overflow: "hidden", marginBottom: 16 }}>
                <div style={{ height: "100%", width: `${progress}%`, background: GRAD, borderRadius: 4, transition: "width 300ms ease" }} />
              </div>

              {/* Results table */}
              <div style={{ overflowX: "auto", border: "1px solid var(--border-1)", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F1F2F8" }}>
                      {["#", "Owner", "Address", "Status", "Phone", "Email"].map((h) => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 800, color: SLATE, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batchRows.map((r, i) => {
                      const chip = STATUS_CHIP[r.status];
                      return (
                        <tr key={i} style={{ borderTop: "1px solid var(--border-1)" }}>
                          <td style={{ padding: "9px 12px", color: SLATE, fontFamily: "var(--font-mono)", fontSize: 12 }}>{i + 1}</td>
                          <td style={{ padding: "9px 12px", fontWeight: 700, color: NAVY, whiteSpace: "nowrap" }}>
                            {r.firstName} {r.lastName}
                            {r.matchedName && r.matchedName.toLowerCase() !== `${r.firstName} ${r.lastName}`.toLowerCase() && (
                              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: SLATE }}>↳ {r.matchedName}</span>
                            )}
                          </td>
                          <td style={{ padding: "9px 12px", color: SLATE, fontSize: 12.5 }}>{[r.street, r.city, r.state, r.zip].filter(Boolean).join(", ")}</td>
                          <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 100, fontSize: 11.5, fontWeight: 700, background: chip.bg, color: chip.fg }} title={r.error || undefined}>
                              {r.status === "tracing" && <Loader2 size={10} className="animate-spin" />}
                              {r.status === "error" && <XCircle size={10} />}
                              {chip.label}
                            </span>
                          </td>
                          <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                            {r.primaryPhone ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: NAVY }}>{r.primaryPhone}</span>
                                {!!r.otherPhones?.length && <span style={{ fontSize: 11, color: SLATE }}>+{r.otherPhones.length}</span>}
                                <CopyBtn value={[r.primaryPhone, ...(r.otherPhones || [])].join(", ")} size={12} />
                              </span>
                            ) : <span style={{ color: "var(--text-4)" }}>—</span>}
                          </td>
                          <td style={{ padding: "9px 12px", fontSize: 12, color: NAVY, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.email || undefined}>
                            {r.email || <span style={{ color: "var(--text-4)" }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
