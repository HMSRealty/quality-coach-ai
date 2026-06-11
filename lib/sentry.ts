// Minimal Sentry error reporter for Cloudflare Workers / Edge runtime.
// Uses the Sentry "Envelope" HTTP endpoint directly so we don't need to ship
// the full @sentry/nextjs SDK (which pulls in Node APIs and won't bundle for
// the edge runtime).
//
// Setup:
//   1. Sign up at https://sentry.io (free for 5k errors/mo)
//   2. Create a project, type "JavaScript"
//   3. Copy the DSN (looks like https://abc123@o12345.ingest.sentry.io/67890)
//   4. Add as a Cloudflare Pages secret: SENTRY_DSN
//
// Usage anywhere in a route:
//   try { ... } catch (e) { await reportError(e, { route: "/api/foo", userId }); throw e; }

interface SentryDsn { protocol: string; host: string; publicKey: string; projectId: string; }

function parseDsn(dsn: string): SentryDsn | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!u.username || !projectId) return null;
    return {
      protocol: u.protocol.replace(":", ""),
      host: u.host,
      publicKey: u.username,
      projectId,
    };
  } catch { return null; }
}

export async function reportError(
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const parsed = parseDsn(dsn);
  if (!parsed) return;

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  const eventId = crypto.randomUUID().replace(/-/g, "");
  const sentAt = new Date().toISOString();

  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: process.env.NEXT_PUBLIC_ENV || "production",
    tags: { runtime: "edge" },
    extra: context,
    exception: {
      values: [{
        type: err instanceof Error ? err.name : "Error",
        value: message,
        stacktrace: stack ? { frames: parseStack(stack) } : undefined,
      }],
    },
  };

  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");

  const endpoint = `${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/envelope/`;
  const auth = `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=realtrack/1.0`;

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": auth },
      body: envelope,
    });
  } catch { /* never let error reporting itself throw */ }
}

// Cheap-and-cheerful stack frame parser. Sentry needs them oldest→newest.
function parseStack(stack: string): Array<Record<string, unknown>> {
  const lines = stack.split("\n").slice(1, 21);   // first line is the message
  const frames: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    const m = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
    if (!m) continue;
    frames.push({
      function: m[1] || "<anonymous>",
      filename: m[2],
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !m[2].includes("node_modules"),
    });
  }
  return frames.reverse();
}
