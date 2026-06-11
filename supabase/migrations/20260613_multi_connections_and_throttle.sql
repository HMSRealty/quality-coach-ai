-- 1) Multiple Readymode dialers per user
--    Drop the UNIQUE(user_id) and add a label so each can be named.
ALTER TABLE public.readymode_connections
  DROP CONSTRAINT IF EXISTS readymode_connections_user_id_key;
ALTER TABLE public.readymode_connections
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS rm_conn_user_active_idx
  ON public.readymode_connections (user_id, is_active, position);

-- 2) Multiple Gemini API keys per user (rotation pool)
--    Encrypted with the same READYMODE_ENC_KEY env var.
CREATE TABLE IF NOT EXISTS public.gemini_api_keys (
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
ALTER TABLE public.gemini_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gk_select_self" ON public.gemini_api_keys;
CREATE POLICY "gk_select_self" ON public.gemini_api_keys FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "gk_insert_self" ON public.gemini_api_keys;
CREATE POLICY "gk_insert_self" ON public.gemini_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "gk_update_self" ON public.gemini_api_keys;
CREATE POLICY "gk_update_self" ON public.gemini_api_keys FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "gk_delete_self" ON public.gemini_api_keys;
CREATE POLICY "gk_delete_self" ON public.gemini_api_keys FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS gk_user_active_idx
  ON public.gemini_api_keys (user_id, is_active, position);

-- 3) Analyzer throttle cycle (global, shared across all users)
--    process-next reads this to decide whether to run or sleep.
--    Cycle: run for `run_seconds`, pause for `pause_seconds`, repeat.
CREATE TABLE IF NOT EXISTS public.analyzer_throttle (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  run_seconds     INT NOT NULL DEFAULT 270,  -- 4.5 min
  pause_seconds   INT NOT NULL DEFAULT 120,  -- 2 min
  phase           TEXT NOT NULL DEFAULT 'running'  CHECK (phase IN ('running','paused')),
  phase_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.analyzer_throttle (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- Service-role only — the throttle is global and not exposed to users.
ALTER TABLE public.analyzer_throttle ENABLE ROW LEVEL SECURITY;

-- 4) Helper RPC: advance the throttle cycle if the current phase's window
--    has elapsed. Returns the current phase + seconds remaining.
CREATE OR REPLACE FUNCTION public.tick_analyzer_throttle()
RETURNS public.analyzer_throttle AS $$
DECLARE
  state public.analyzer_throttle;
  elapsed INT;
BEGIN
  SELECT * INTO state FROM public.analyzer_throttle WHERE id = 1 FOR UPDATE;
  elapsed := EXTRACT(EPOCH FROM (now() - state.phase_started_at))::INT;
  IF state.phase = 'running' AND elapsed >= state.run_seconds THEN
    UPDATE public.analyzer_throttle
       SET phase = 'paused', phase_started_at = now(), updated_at = now()
     WHERE id = 1
     RETURNING * INTO state;
  ELSIF state.phase = 'paused' AND elapsed >= state.pause_seconds THEN
    UPDATE public.analyzer_throttle
       SET phase = 'running', phase_started_at = now(), updated_at = now()
     WHERE id = 1
     RETURNING * INTO state;
  END IF;
  RETURN state;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.tick_analyzer_throttle() TO authenticated, service_role;
