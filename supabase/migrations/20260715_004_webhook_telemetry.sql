-- =====================================================================
-- RealTrack — webhook endpoint telemetry
--
-- THE BUG (found by end-to-end testing against production, 2026-07-15):
-- after a successful webhook POST, webhook_endpoints.last_seen_at was still
-- null and events_received was still 0.
--
-- Two causes:
--   1. events_received was never incremented anywhere.
--   2. The route updated last_seen_at with a fire-and-forget
--      `.then(() => {})`. On Cloudflare's edge runtime, work not awaited (and
--      not registered with waitUntil) is cancelled once the response is
--      returned, so the update usually never ran.
--
-- Fixing it in the route would mean either awaiting an extra round trip in
-- the hot path (the exact thing that made the legacy webhook time out) or
-- reaching for waitUntil, which Next.js edge routes do not cleanly expose.
--
-- A trigger is strictly better: atomic with the insert that causes it,
-- impossible to forget at another call site, and free from the edge's point
-- of view. The webhook stays a single insert.
--
-- Why this matters beyond tidiness: this telemetry is how an operator answers
-- "is my dialer actually posting?". A silent 0 reads identically to a dead
-- feed, which is precisely the failure this product exists to eliminate.
-- =====================================================================

create or replace function public.rt_touch_webhook_endpoint()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.endpoint_id is not null then
    update public.webhook_endpoints
       set last_seen_at    = new.received_at,
           events_received = events_received + 1
     where id = new.endpoint_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_ingest_touch_endpoint on public.ingest_events;
create trigger trg_ingest_touch_endpoint
  after insert on public.ingest_events
  for each row execute function public.rt_touch_webhook_endpoint();

-- Backfill from events already captured, so the counter reflects reality
-- rather than starting from whenever this migration happened to run.
update public.webhook_endpoints w
   set events_received = sub.n,
       last_seen_at    = sub.last_at
  from (
    select endpoint_id, count(*) as n, max(received_at) as last_at
    from public.ingest_events
    where endpoint_id is not null
    group by endpoint_id
  ) sub
 where w.id = sub.endpoint_id;
