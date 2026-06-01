// app/api/leads/analyze/route.ts
// Edge-runtime re-export of the canonical analyze route.
// Kept so existing frontend `fetch("/api/leads/analyze")` calls keep working.

export { POST } from "../../analyze/route";
export const runtime = "edge";
export const dynamic = "force-dynamic";
