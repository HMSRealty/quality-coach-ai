-- Per-workspace Google Sheets push destination. Stores the URL of a
-- user-deployed Apps Script Web App that RealTrack POSTs report data to.
-- This is push-only — nothing about the sheet is mirrored in Postgres, the
-- sheet is the source of truth for the user.

alter table public.organizations
  add column if not exists sheets_webhook_url text;

alter table public.organizations
  add column if not exists sheets_webhook_secret text;

alter table public.organizations
  add column if not exists sheets_last_sync_at timestamptz;
