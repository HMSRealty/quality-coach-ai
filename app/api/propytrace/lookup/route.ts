export const runtime = "edge";

import { NextResponse } from "next/server";
import { adminClient, requirePaidUser, readProviderKey, parseTraceInput, traceOne, logTraces } from "@/lib/skiptrace";

// Single skip trace: name + address in → best phone, matched name, email out.
// Validation, the provider call, and the paid gate live in lib/skiptrace.

export async function POST(req: Request) {
  try {
    const sb = adminClient();
    const gate = await requirePaidUser(req, sb);
    if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const parsed = parseTraceInput(await req.json().catch(() => ({})));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const apiKey = await readProviderKey();
    if (!apiKey) return NextResponse.json({ error: "Skip tracing is not configured for this workspace. Contact support." }, { status: 503 });

    const result = await traceOne(parsed.input, apiKey);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });

    await logTraces(sb, gate.userId, [{ input: parsed.input, result }]);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Lookup failed" }, { status: 500 });
  }
}
