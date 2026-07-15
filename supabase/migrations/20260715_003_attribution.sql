-- =====================================================================
-- RealTrack — Campaign + agent attribution resolvers
-- Depends on 20260715_001_realtrack_core.sql.
--
-- THE BUG THIS FIXES (measured on live data 2026-07-15):
--   119 of 120 leads had NO campaign.
--
-- Why it happened: the dialer posts its OWN identifiers —
--     {"campaign_id": "78bf4842-…", "campaign": "SWAT", "agent_name": "hagag"}
--   while RealTrack's campaigns table held "tx" and "tx hb". The inbound route
--   tried campaign_id as a RealTrack UUID (it is Readymode's, so it never
--   matches) then fell back to an exact name match (no "SWAT" row exists).
--   Result: campaignId stayed null on essentially every lead, and Campaign
--   Intelligence had nothing to read.
--
-- Why an alias table is the fix and not a bigger UUID hammer: the two systems
-- have INDEPENDENT namespaces. Readymode's UUID will never equal ours, at any
-- scale, ever. There is nothing to "match" — there is only something to MAP.
-- The mapping is data, so it belongs in a table, not in code.
--
-- Auto-create on first sight means a new dialer campaign starts collecting
-- attributed data immediately rather than silently dropping it on the floor
-- until someone notices and configures it by hand. Rows are flagged
-- auto_created = true so the UI can prompt an owner to confirm or merge.
-- =====================================================================

-- Resolve a dialer campaign identifier to a RealTrack campaign, creating the
-- campaign + alias on first sight.
--
-- SECURITY DEFINER: called by the service role from the ingest path. It never
-- reads auth.uid() and takes the org explicitly, so it cannot be used to cross
-- a tenant boundary.
create or replace function public.rt_resolve_campaign(
  p_org      uuid,
  p_provider text,
  p_name     text,
  p_ext_id   text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_campaign uuid;
  v_name     text := nullif(btrim(coalesce(p_name, '')), '');
  v_ext      text := nullif(btrim(coalesce(p_ext_id, '')), '');
begin
  if p_org is null then
    return null;
  end if;

  -- 1. Try the dialer's stable id first — a campaign can be renamed in the
  --    dialer without breaking attribution, which a name match cannot survive.
  if v_ext is not null then
    select campaign_id into v_campaign
    from public.campaign_aliases
    where organization_id = p_org
      and provider = p_provider
      and external_kind = 'id'
      and lower(external_value) = lower(v_ext);
    if v_campaign is not null then
      return v_campaign;
    end if;
  end if;

  -- 2. Try the name alias.
  if v_name is not null then
    select campaign_id into v_campaign
    from public.campaign_aliases
    where organization_id = p_org
      and provider = p_provider
      and external_kind = 'name'
      and lower(external_value) = lower(v_name);
    if v_campaign is not null then
      -- Backfill the id alias so future posts resolve on the stable key.
      if v_ext is not null then
        insert into public.campaign_aliases
          (organization_id, campaign_id, external_value, external_kind, provider, auto_created)
        values (p_org, v_campaign, v_ext, 'id', p_provider, true)
        on conflict do nothing;
      end if;
      return v_campaign;
    end if;
  end if;

  -- 3. Nothing mapped. Without a name we cannot invent a sensible campaign —
  --    return null rather than bucket unrelated calls into a junk campaign.
  if v_name is null then
    return null;
  end if;

  -- 4. Adopt an existing same-named RealTrack campaign if one exists, else
  --    create it. ON CONFLICT handles the race where two webhook posts for a
  --    brand-new campaign arrive together.
  insert into public.campaigns_v2 (organization_id, name, description)
  values (p_org, v_name, 'Auto-created from ' || p_provider || ' on first sight')
  on conflict (organization_id, name) do update set name = excluded.name
  returning id into v_campaign;

  insert into public.campaign_aliases
    (organization_id, campaign_id, external_value, external_kind, provider, auto_created)
  values (p_org, v_campaign, v_name, 'name', p_provider, true)
  on conflict do nothing;

  if v_ext is not null then
    insert into public.campaign_aliases
      (organization_id, campaign_id, external_value, external_kind, provider, auto_created)
    values (p_org, v_campaign, v_ext, 'id', p_provider, true)
    on conflict do nothing;
  end if;

  return v_campaign;
end $$;

-- Resolve a dialer agent name ("hagag") to an agent_identity, creating it on
-- first sight. profile_id stays null until an owner links it to a real user —
-- so calls are still attributed to a stable identity and simply wait to be
-- claimed, rather than being dropped.
create or replace function public.rt_resolve_agent(
  p_org      uuid,
  p_provider text,
  p_name     text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if p_org is null or v_name is null then
    return null;
  end if;

  select id into v_id
  from public.agent_identities
  where organization_id = p_org
    and provider = p_provider
    and lower(external_name) = lower(v_name);
  if v_id is not null then
    return v_id;
  end if;

  insert into public.agent_identities
    (organization_id, provider, external_name, auto_created)
  values (p_org, p_provider, v_name, true)
  on conflict (organization_id, provider, lower(external_name)) do update
    set external_name = excluded.external_name
  returning id into v_id;

  return v_id;
end $$;

-- Link an unclaimed dialer agent to a real profile. Backfills historical calls
-- so an agent's history doesn't start on the day someone got round to linking
-- them.
create or replace function public.rt_link_agent(
  p_identity uuid,
  p_profile  uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.agent_identities where id = p_identity;
  if v_org is null then
    raise exception 'agent identity % not found', p_identity;
  end if;

  -- Refuse to link across tenants. Cheap check, catastrophic if missed.
  if not exists (
    select 1 from public.profiles
    where id = p_profile and organization_id = v_org
  ) then
    raise exception 'profile % is not in organization %', p_profile, v_org;
  end if;

  update public.agent_identities
    set profile_id = p_profile, auto_created = false
  where id = p_identity;

  update public.calls_v2
    set agent_profile_id = p_profile
  where agent_identity_id = p_identity;
end $$;

-- Revoke the resolvers from clients: ingest-path only, service role only.
revoke all on function public.rt_resolve_campaign(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.rt_resolve_agent(uuid, text, text) from public, anon, authenticated;
revoke all on function public.rt_link_agent(uuid, uuid) from public, anon;
-- Linking is a management action performed through the app's server routes.
revoke all on function public.rt_link_agent(uuid, uuid) from authenticated;
