-- Manual approval gate for new top-level signups.
-- Existing accounts auto-approved. New signups land as is_approved=false and
-- need an admin to flip the flag before they can use the dashboard.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;

-- Approve everyone who already exists so we don't break current users.
UPDATE public.profiles SET is_approved = TRUE WHERE created_at < now();

-- Sub-users (have a parent_user_id) inherit access — auto-approve them.
UPDATE public.profiles
   SET is_approved = TRUE
 WHERE parent_user_id IS NOT NULL;

-- Index so the dashboard auth check is fast.
CREATE INDEX IF NOT EXISTS profiles_is_approved_idx ON public.profiles (is_approved);

COMMENT ON COLUMN public.profiles.is_approved IS
  'Set by an admin in /admin/profiles to grant a new signup access to the dashboard.';
