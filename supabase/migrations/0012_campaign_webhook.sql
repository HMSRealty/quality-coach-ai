-- 0012_campaign_webhook.sql
-- Per-campaign outbound webhook: leads from a campaign can be POSTed to this URL.
alter table public.campaigns add column if not exists webhook_url text;
