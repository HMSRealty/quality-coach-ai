-- Ensure payment_status column exists with the right default for the
-- manual bank-transfer onboarding flow.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';

-- Existing approved accounts (admins, the HMS team, etc.) are obviously
-- paid — mark them so the pending page doesn't bother them on next login.
UPDATE public.profiles
   SET payment_status = 'paid'
 WHERE is_approved = TRUE
   AND (payment_status IS NULL OR payment_status = 'unpaid' OR payment_status = '');

-- Sub-users inherit access from their parent and never pay directly.
UPDATE public.profiles
   SET payment_status = 'paid'
 WHERE parent_user_id IS NOT NULL
   AND (payment_status IS NULL OR payment_status = 'unpaid' OR payment_status = '');

CREATE INDEX IF NOT EXISTS profiles_payment_status_idx ON public.profiles (payment_status);

COMMENT ON COLUMN public.profiles.payment_status IS
  'unpaid → no payment yet · submitted_verification → receipt uploaded, awaiting admin review · paid → activated';

-- Ensure the receipts storage bucket exists. Run idempotently.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('receipts', 'receipts', false)
  ON CONFLICT (id) DO NOTHING;

-- RLS on the bucket: users can upload their own receipts; only admin/service
-- role can read them (so receipts stay private).
DROP POLICY IF EXISTS "receipts_insert_own" ON storage.objects;
CREATE POLICY "receipts_insert_own" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "receipts_select_own_or_admin" ON storage.objects;
CREATE POLICY "receipts_select_own_or_admin" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
         WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );
