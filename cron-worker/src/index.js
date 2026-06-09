// RealTrack queue cron worker.
// Fires every minute (see wrangler.toml [triggers].crons) and calls the Pages
// app's /api/cron/drain endpoint, which advances every owner's lead-analysis
// queue. Authenticated with CRON_SECRET (set via `wrangler secret put CRON_SECRET`).
export default {
  async scheduled(event, env, ctx) {
    const url = env.DRAIN_URL;
    if (!url) return;
    ctx.waitUntil(
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CRON_SECRET || ""}` },
      }).catch(() => {}),
    );
  },

  // Manual trigger for testing: GET the worker URL to drain on demand.
  async fetch(req, env, ctx) {
    const r = await fetch(env.DRAIN_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CRON_SECRET || ""}` },
    }).catch((e) => new Response("drain failed: " + e, { status: 502 }));
    return new Response("triggered drain → " + r.status, { status: 200 });
  },
};
