-- ===========================================================================
-- Pillar 7: private call recordings.  Pillar 2: stored transcripts for cheap re-runs.
-- ===========================================================================

-- 1) Ensure the PRIVATE bucket exists (public = false).
insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do update set public = false;

-- 2) Track which bucket each recording row lives in (legacy rows = call-uploads).
alter table public.call_uploads
  add column if not exists bucket text;
update public.call_uploads set bucket = 'call-uploads' where bucket is null;

-- 3) Authenticated direct uploads into the private bucket, scoped to the
--    uploader's org folder. (Server routes use the service role and bypass this,
--    but this lets sub-users upload directly too without leaking across tenants.)
do $$ begin
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='call-recordings upload by org') then
    drop policy "call-recordings upload by org" on storage.objects;
  end if;
end $$;
create policy "call-recordings upload by org" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'call-recordings'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- Reads/deletes of objects are done via short-lived SIGNED URLs minted by the
-- server (service role), so no public SELECT policy is needed — keeping the
-- bucket fully private.

-- 4) Transcript cache for cheap re-grades (Pillar 2). When a lead is analyzed we
--    store the diarized transcript so a "Re-run" against a new prompt/persona
--    re-grades TEXT instead of re-sending heavy audio to Gemini.
alter table public.leads
  add column if not exists transcript text;
