-- Per-user toggle for the automatic Readymode recording fetcher.
-- Default ON for existing accounts (preserves current behaviour).
-- New accounts default OFF so they don't waste cron cycles before connecting.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_fetch_recordings BOOLEAN NOT NULL DEFAULT FALSE;

-- Enable for accounts that already have a Readymode connection (so HMS
-- and anyone mid-setup keeps working).
UPDATE public.profiles p
   SET auto_fetch_recordings = TRUE
 WHERE EXISTS (
   SELECT 1 FROM public.readymode_connections rc
    WHERE rc.user_id = p.id AND rc.is_active = TRUE
 );

COMMENT ON COLUMN public.profiles.auto_fetch_recordings IS
  'When true, the cron worker scans recent leads and pulls call recordings from Readymode. Turn off to accept lead-only webhooks without any recording fetch.';
