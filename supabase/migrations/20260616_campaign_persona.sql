-- Per-campaign persona override. Optional — when set, takes precedence over
-- the org-level persona for any lead matched to this campaign.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS custom_persona TEXT;

COMMENT ON COLUMN public.campaigns.custom_persona IS
  'Optional override for the AI persona on leads in this campaign. Falls back to org persona, then platform default.';

-- Ensure custom_rules exists too (the campaigns UI saves to this column).
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS custom_rules TEXT;

-- Backfill: if a campaign has the legacy `rules` column populated but no
-- `custom_rules`, copy them so the updated analyze route picks them up
-- immediately. Wrapped in a DO block so this is a no-op on schemas that
-- never had the legacy column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'rules'
  ) THEN
    EXECUTE 'UPDATE public.campaigns
                SET custom_rules = rules
              WHERE custom_rules IS NULL AND rules IS NOT NULL AND rules <> ''''';
  END IF;
END $$;
