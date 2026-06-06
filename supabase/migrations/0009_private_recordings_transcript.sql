-- ===========================================================================
-- Pillar 7: private call recordings.  Pillar 2: stored transcripts for cheap re-runs.
-- Idempotent + self-contained (creates call_uploads if it never existed).
-- ===========================================================================

-- 1) Ensure the PRIVATE bucket exists (public = false).
insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do update set public = false;

-- 2) call_uploads — the recording library table the app reads/writes. It was
--    never created on this DB, so create it now (and add the new `bucket` col).
create table if not exists public.call_uploads (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references public.leads(id) on delete cascade,
  user_id         uuid,
  uploaded_by     uuid,
  file_name       text,
  file_path       text,
  bucket          text,
  file_size_bytes bigint,
  storage_url     text,
  status          text default 'uploaded',
  created_at      timestamptz not null default now()
);
create index if not exists idx_call_uploads_lead on public.call_uploads(lead_id);

-- In case an older variant exists, make sure every column we use is present.
alter table public.call_uploads add column if not exists user_id         uuid;
alter table public.call_uploads add column if not exists uploaded_by     uuid;
alter table public.call_uploads add column if not exists file_name       text;
alter table public.call_uploads add column if not exists file_path       text;
alter table public.call_uploads add column if not exists bucket          text;
alter table public.call_uploads add column if not exists file_size_bytes bigint;
alter table public.call_uploads add column if not exists storage_url     text;
alter table public.call_uploads add column if not exists status          text default 'uploaded';
alter table public.call_uploads add column if not exists created_at      timestamptz not null default now();

update public.call_uploads set bucket = 'call-uploads' where bucket is null;

-- RLS: org members (with leads.view) can read their org's recording rows;
-- writes are done by the service role (which bypasses RLS).
alter table public.call_uploads enable row level security;
drop policy if exists call_uploads_select on public.call_uploads;
create policy call_uploads_select on public.call_uploads for select
  using (
    exists (
      select 1 from public.leads l
      where l.id = call_uploads.lead_id
        and l.organization_id = public.current_org_id()
        and public.has_perm('leads.view')
    )
    or call_uploads.user_id = auth.uid()
  );

-- 3) Authenticated direct uploads into the private bucket, scoped to org folder.
drop policy if exists "call-recordings upload by org" on storage.objects;
create policy "call-recordings upload by org" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'call-recordings'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- 4) Transcript cache for cheap re-grades (Pillar 2).
alter table public.leads
  add column if not exists transcript text;
