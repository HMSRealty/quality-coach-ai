export const runtime = "edge";

import { NextResponse } from "next/server";
import { adminClient, requirePaidUser, readProviderKey, parseTraceInput, traceMany, logTraces, type TraceInput, type TraceResult } from "@/lib/skiptrace";

// Batch skip trace: up to CHUNK_MAX rows per request, traced with bounded
// concurrency. The dashboard sends larger lists in sequential chunks so each
// request stays fast and a mid-list failure never loses earlier results.

const CHUNK_MAX = 10;
const CONCURRENCY = 4;

export async function POST(req: Request) {
  try {
    const sb = adminClient();
    const gate = await requirePaidUser(req, sb);
    if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await req.json().catch(() => ({}))) as { items?: unknown[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return NextResponse.json({ error: "No rows to trace." }, { status: 400 });
    if (items.length > CHUNK_MAX) {
      return NextResponse.json({ error: `Send at most ${CHUNK_MAX} rows per request.` }, { status: 400 });
    }

    const apiKey = await readProviderKey();
    if (!apiKey) return NextResponse.json({ error: "Skip tracing is not configured for this workspace. Contact support." }, { status: 503 });

    // Validate every row up front; invalid rows get an inline error and are
    // skipped (the batch still runs — one bad row never sinks the list).
    const parsed = items.map(parseTraceInput);
    const runnable: { index: number; input: TraceInput }[] = [];
    parsed.forEach((p, index) => { if (p.ok) runnable.push({ index, input: p.input }); });

    const traced = await traceMany(runnable.map((r) => r.input), apiKey, CONCURRENCY);

    const results: TraceResult[] = parsed.map((p) =>
      p.ok
        ? { found: false, matchedName: "", primaryPhone: "", otherPhones: [], email: "" }
        : { found: false, matchedName: "", primaryPhone: "", otherPhones: [], email: "", error: p.error },
    );
    runnable.forEach((r, i) => { results[r.index] = traced[i]; });

    await logTraces(sb, gate.userId, runnable.map((r, i) => ({ input: r.input, result: traced[i] })));

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Batch failed" }, { status: 500 });
  }
}
