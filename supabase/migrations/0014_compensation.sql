-- 0014_compensation.sql
-- Compensation base per job title + an editable KPI structure (KPI · % · payment).
create table if not exists public.comp_titles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  organization_id  uuid,
  title            text not null,
  base_salary      numeric not null default 0,
  kpis             jsonb not null default '[]'::jsonb,   -- [{ name, percentage, payment }]
  basis            text,                                  -- e.g. "Documentation + team performance"
  position         integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists idx_comp_titles_user on public.comp_titles(user_id);

alter table public.comp_titles enable row level security;
drop policy if exists "comp_titles_own" on public.comp_titles;
create policy "comp_titles_own" on public.comp_titles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
