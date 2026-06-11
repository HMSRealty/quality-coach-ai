// RealTrack queue cron worker.
// Fires every minute (see wrangler.toml [triggers].crons) and calls two
// endpoints on the Pages app:
//   1. /api/cron/drain — advances each owner's lead-analysis queue.
//   2. /api/cron/fetch-recordings — finds recordings for recent Readymode
//      leads that don't have audio attached yet.
// Both are authenticated with CRON_SECRET.
async function ping(url, secret) {
  if (!url) return null;
  try {
    return await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret || ""}` },
    });
  } catch {
    return null;
  }
}

export default {
  async scheduled(event, env, ctx) {
    const secret = env.CRON_SECRET || "";
    const fetchRecsUrl = env.DRAIN_URL ? env.DRAIN_URL.replace("/api/cron/drain", "/api/cron/fetch-recordings") : null;
    ctx.waitUntil(Promise.all([
      ping(env.DRAIN_URL, secret),
      ping(fetchRecsUrl, secret),
    ]));
  },

  // Manual trigger for testing: GET the worker URL to run both jobs on demand.
  async fetch(req, env, ctx) {
    const secret = env.CRON_SECRET || "";
    const fetchRecsUrl = env.DRAIN_URL ? env.DRAIN_URL.replace("/api/cron/drain", "/api/cron/fetch-recordings") : null;
    const [drainR, recsR] = await Promise.all([
      ping(env.DRAIN_URL, secret),
      ping(fetchRecsUrl, secret),
    ]);
    return new Response(`drain → ${drainR?.status ?? "fail"}, fetch-recordings → ${recsR?.status ?? "fail"}`, { status: 200 });
  },
};
