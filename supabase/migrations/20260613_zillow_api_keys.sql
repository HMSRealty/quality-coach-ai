-- Per-tenant Zillow / RapidAPI keys with the same rotation pattern as
-- gemini_api_keys. Each tenant can register multiple keys, pause / resume,
-- and the analyze + zillow routes pick a working one automatically.

CREATE TABLE IF NOT EXISTS public.zillow_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID,
  label           TEXT,
  key_enc         TEXT NOT NULL,        -- AES-GCM ciphertext
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at    TIMESTAMPTZ,
  last_error_at   TIMESTAMPTZ,
  last_error      TEXT,
  consecutive_errors INT NOT NULL DEFAULT 0,
  position        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.zillow_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zk_select_self" ON public.zillow_api_keys;
CREATE POLICY "zk_select_self" ON public.zillow_api_keys FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "zk_insert_self" ON public.zillow_api_keys;
CREATE POLICY "zk_insert_self" ON public.zillow_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "zk_update_self" ON public.zillow_api_keys;
CREATE POLICY "zk_update_self" ON public.zillow_api_keys FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "zk_delete_self" ON public.zillow_api_keys;
CREATE POLICY "zk_delete_self" ON public.zillow_api_keys FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS zk_user_active_idx
  ON public.zillow_api_keys (user_id, is_active, position);
