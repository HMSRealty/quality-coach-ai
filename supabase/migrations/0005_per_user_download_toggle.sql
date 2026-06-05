-- ============================================================================
-- Per-sub-user "Download recordings" override.
-- The RBAC matrix grants calls.download to QA / Admin / Owner. Owners want the
-- ability to TURN IT OFF for a specific sub-user even if their role would allow
-- it (e.g. a QA they don't fully trust yet). Default = false (download disabled
-- for sub-users until the owner enables it).
-- Owners + Admins themselves: NULL = "use role default" => allowed.
-- ============================================================================

alter table public.profiles
  add column if not exists can_download_calls boolean;

-- Default existing sub-users to FALSE; top-level owners/admins stay NULL (=allowed).
update public.profiles set can_download_calls = false
  where can_download_calls is null and parent_user_id is not null;
