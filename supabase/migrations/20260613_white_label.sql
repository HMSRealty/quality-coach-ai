-- Per-tenant white-label settings. Optional — when set, override the default
-- RealTrack branding on the org owner's dashboard for them and all their
-- sub-users.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_name TEXT,
  ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_color TEXT,         -- e.g. "#0EA5E9"
  ADD COLUMN IF NOT EXISTS brand_email_from TEXT;    -- optional override of email From line

COMMENT ON COLUMN public.organizations.brand_name IS
  'Display name shown in the sidebar and emails. Defaults to RealTrack.';
COMMENT ON COLUMN public.organizations.brand_logo_url IS
  'Public URL to the org logo. Used in the dashboard nav and emails.';
COMMENT ON COLUMN public.organizations.brand_color IS
  'Hex accent color (e.g. #0EA5E9). Used for primary buttons and active links.';

-- Storage bucket for logo uploads — public read, only the org owner writes.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('brand-logos', 'brand-logos', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "brand_logo_owner_write" ON storage.objects;
CREATE POLICY "brand_logo_owner_write" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'brand-logos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "brand_logo_public_read" ON storage.objects;
CREATE POLICY "brand_logo_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-logos');

DROP POLICY IF EXISTS "brand_logo_owner_update" ON storage.objects;
CREATE POLICY "brand_logo_owner_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'brand-logos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "brand_logo_owner_delete" ON storage.objects;
CREATE POLICY "brand_logo_owner_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'brand-logos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
