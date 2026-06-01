-- ════════════════════════════════════════════════════════════════
-- HMS Realty — Permissions & Dynamic Forms Migration
-- Run in Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════

-- 1) Add permission flag to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS can_receive_leads boolean DEFAULT true;

-- 2) Submission forms table (one row per user-owned shareable form)
CREATE TABLE IF NOT EXISTS public.submission_forms (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slug       text NOT NULL UNIQUE,
  name       text DEFAULT 'Submit a Lead',
  is_active  boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submission_forms_slug ON public.submission_forms(slug);
CREATE INDEX IF NOT EXISTS idx_submission_forms_user ON public.submission_forms(user_id);

ALTER TABLE public.submission_forms ENABLE ROW LEVEL SECURITY;

-- Public can READ active forms by slug (needed for the public submit page)
CREATE POLICY "Public can read active forms"
  ON public.submission_forms FOR SELECT
  USING (true);

-- Owner can manage their own form
CREATE POLICY "Users manage their own forms"
  ON public.submission_forms FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3) Link leads to which form they came from (optional, for attribution)
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS submission_form_id uuid REFERENCES public.submission_forms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_submission_form ON public.leads(submission_form_id);

-- 4) Allow public INSERT into leads ONLY when target user can_receive_leads
-- Drop existing policy first (if any) to avoid conflicts
DROP POLICY IF EXISTS "Public can submit leads to active forms" ON public.leads;
CREATE POLICY "Public can submit leads to active forms"
  ON public.leads FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = leads.user_id
        AND p.can_receive_leads = true
    )
    AND (
      submission_form_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.submission_forms sf
        WHERE sf.id = leads.submission_form_id
          AND sf.is_active = true
      )
    )
  );

-- 5) Allow public to read submission_forms by slug (for the dynamic page)
-- The "Public can read active forms" policy above already covers this.

-- 6) Helper: auto-provision a form for every existing user
INSERT INTO public.submission_forms (user_id, slug, name, is_active)
SELECT
  p.id,
  -- generate a unique slug from email prefix + last 6 of id
  lower(regexp_replace(split_part(p.email, '@', 1), '[^a-z0-9]+', '-', 'g'))
    || '-' || substring(p.id::text from 1 for 6),
  'Submit a Lead',
  true
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.submission_forms sf WHERE sf.user_id = p.id)
ON CONFLICT (slug) DO NOTHING;
