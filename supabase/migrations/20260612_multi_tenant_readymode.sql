-- Multi-tenant Readymode connections + monthly AI usage tracker.
-- Run in Supabase SQL Editor.

-- ─────────────────────────────────────────────────────────────────────────────
-- readymode_connections — per-user encrypted Readymode admin credentials.
-- One row per user (the org owner sets this up).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.readymode_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID,
  subdomain       TEXT NOT NULL,                -- e.g. "hmsrealty"
  username        TEXT NOT NULL,                -- Readymode admin login
  password_enc    TEXT NOT NULL,                -- AES-GCM ciphertext, base64
  last_used_at    TIMESTAMPTZ,
  last_login_ok   BOOLEAN,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.readymode_connections ENABLE ROW LEVEL SECURITY;

-- Owners can read/update only their own connection.
DROP POLICY IF EXISTS "rm_conn_select_self" ON public.readymode_connections;
CREATE POLICY "rm_conn_select_self" ON public.readymode_connections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rm_conn_insert_self" ON public.readymode_connections;
CREATE POLICY "rm_conn_insert_self" ON public.readymode_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "rm_conn_update_self" ON public.readymode_connections;
CREATE POLICY "rm_conn_update_self" ON public.readymode_connections
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "rm_conn_delete_self" ON public.readymode_connections;
CREATE POLICY "rm_conn_delete_self" ON public.readymode_connections
  FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- org_ai_usage — monthly counter for AI analyses (cost cap enforcement).
-- One row per (user, month_key) — month_key is YYYY-MM in UTC.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_ai_usage (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_key      TEXT NOT NULL,                 -- "2026-06"
  analyses_count INT NOT NULL DEFAULT 0,
  analyses_cap   INT,                            -- NULL = unlimited (per plan)
  cost_estimate  NUMERIC(10,4) NOT NULL DEFAULT 0,
  last_updated   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month_key)
);

ALTER TABLE public.org_ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_select_self" ON public.org_ai_usage;
CREATE POLICY "ai_usage_select_self" ON public.org_ai_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS org_ai_usage_user_month
  ON public.org_ai_usage (user_id, month_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: increment usage by 1, creating the row if needed.
-- Called from /api/analyze before kicking off Gemini.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_ai_usage(
  p_user_id UUID,
  p_month_key TEXT,
  p_cost NUMERIC DEFAULT 0
) RETURNS public.org_ai_usage AS $$
DECLARE
  result public.org_ai_usage;
BEGIN
  INSERT INTO public.org_ai_usage (user_id, month_key, analyses_count, cost_estimate)
    VALUES (p_user_id, p_month_key, 1, p_cost)
  ON CONFLICT (user_id, month_key)
  DO UPDATE SET
    analyses_count = public.org_ai_usage.analyses_count + 1,
    cost_estimate  = public.org_ai_usage.cost_estimate + EXCLUDED.cost_estimate,
    last_updated   = now()
  RETURNING * INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.bump_ai_usage(UUID, TEXT, NUMERIC) TO authenticated, service_role;
