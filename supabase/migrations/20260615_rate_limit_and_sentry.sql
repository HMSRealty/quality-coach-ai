-- Per-API-key per-minute counter for the inbound webhook. Old minute rows
-- can be pruned by a periodic cron; for now we just keep them — they're
-- small and the table is bounded by (keys × minutes_alive).
CREATE TABLE IF NOT EXISTS public.webhook_rate_limit (
  key_id      UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  minute_key  TEXT NOT NULL,         -- "YYYY-MM-DDTHH:MM" (UTC)
  count       INT  NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (key_id, minute_key)
);
CREATE INDEX IF NOT EXISTS wrl_minute_key_idx ON public.webhook_rate_limit (minute_key);
ALTER TABLE public.webhook_rate_limit ENABLE ROW LEVEL SECURITY;
-- service-role only; users never touch this directly

-- Atomic bump-and-return — increments the counter for (key, minute) and
-- returns the new value.
CREATE OR REPLACE FUNCTION public.bump_rate_limit(
  p_key_id    UUID,
  p_minute_key TEXT
) RETURNS public.webhook_rate_limit AS $$
DECLARE
  result public.webhook_rate_limit;
BEGIN
  INSERT INTO public.webhook_rate_limit (key_id, minute_key, count)
    VALUES (p_key_id, p_minute_key, 1)
  ON CONFLICT (key_id, minute_key)
  DO UPDATE SET
    count      = public.webhook_rate_limit.count + 1,
    updated_at = now()
  RETURNING * INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.bump_rate_limit(UUID, TEXT) TO service_role;

-- Cleanup: delete counter rows older than 2 hours. Run weekly or skip —
-- the rows are tiny.
CREATE OR REPLACE FUNCTION public.prune_rate_limit_rows() RETURNS INT AS $$
DECLARE deleted INT;
BEGIN
  DELETE FROM public.webhook_rate_limit
   WHERE updated_at < now() - INTERVAL '2 hours';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.prune_rate_limit_rows() TO service_role;
