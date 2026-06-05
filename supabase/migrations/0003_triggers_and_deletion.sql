-- =====================================================================
-- RealTrack CRM — Phase 1: timezone rule, timeline triggers, safe deletion
-- Depends on 0001 + 0004 + 0002 (run AFTER the bridge so leads has the new cols).
-- =====================================================================

-- updated_at: attach the trigger now that leads.updated_at is guaranteed to
-- exist (0004 adds it to a pre-existing leads table).
drop trigger if exists trg_leads_touch on public.leads;
create trigger trg_leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Auto-fill organization_id on INSERT.
-- The live app inserts leads WITHOUT organization_id (it sets the legacy
-- user_id / created_by). Derive the org from the owning profile so:
--   (a) new leads show up in org-scoped views (pipeline/RLS), and
--   (b) the audit trigger below never tries to write a NULL org into the
--       NOT NULL timeline tables (which would abort the insert).
-- to_jsonb(new)->>'user_id' reads user_id WITHOUT failing on a greenfield
-- leads table that has no such column.
-- ---------------------------------------------------------------------
create or replace function public.leads_fill_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id is null then
    new.organization_id := coalesce(
      (select organization_id from public.profiles where id = new.created_by),
      (select organization_id from public.profiles where id = new.assigned_to),
      (select organization_id from public.profiles where id = ((to_jsonb(new) ->> 'user_id')::uuid)),
      (select organization_id from public.profiles where id = auth.uid())
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_leads_fill_org on public.leads;
create trigger trg_leads_fill_org before insert on public.leads
  for each row execute function public.leads_fill_org();

-- ---------------------------------------------------------------------
-- EST submission date.
--   * INSERT: default submission_date to "today" in America/New_York.
--   * UPDATE: silently reject changes unless the user has lead.date.override
--             (QA / Admin / Owner). This makes the field READ-ONLY for callers
--             even if a crafted client tries to PATCH it.
-- ---------------------------------------------------------------------
create or replace function public.leads_submission_date_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.submission_date is null then
      new.submission_date := (now() at time zone 'America/New_York')::date;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.submission_date is distinct from old.submission_date
       and not public.has_perm('lead.date.override') then
      new.submission_date := old.submission_date;   -- keep original
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_leads_submission_date on public.leads;
create trigger trg_leads_submission_date before insert or update on public.leads
  for each row execute function public.leads_submission_date_guard();

-- ---------------------------------------------------------------------
-- Timeline: write status/stage changes into history + lead_events so the
-- lead timeline stays truthful no matter which client made the change.
-- ---------------------------------------------------------------------
create or replace function public.leads_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Belt-and-suspenders: never attempt to log a lead with no org (the timeline
  -- tables require organization_id). leads_fill_org normally prevents this.
  if new.organization_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.lead_events(organization_id, lead_id, type, actor_id, payload)
    values (new.organization_id, new.id, 'created', auth.uid(),
            jsonb_build_object('status', new.status, 'stage', new.stage));
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.lead_status_history(organization_id, lead_id, from_status, to_status, changed_by)
    values (new.organization_id, new.id, old.status, new.status, auth.uid());
    insert into public.lead_events(organization_id, lead_id, type, actor_id, payload)
    values (new.organization_id, new.id, 'status_changed', auth.uid(),
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;

  if new.stage is distinct from old.stage then
    insert into public.lead_events(organization_id, lead_id, type, actor_id, payload)
    values (new.organization_id, new.id, 'stage_changed', auth.uid(),
            jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.lead_events(organization_id, lead_id, type, actor_id, payload)
    values (new.organization_id, new.id, 'assignment_changed', auth.uid(),
            jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
  end if;

  return new;
end $$;

drop trigger if exists trg_leads_audit_ins on public.leads;
create trigger trg_leads_audit_ins after insert on public.leads
  for each row execute function public.leads_audit();

drop trigger if exists trg_leads_audit_upd on public.leads;
create trigger trg_leads_audit_upd after update on public.leads
  for each row execute function public.leads_audit();

-- ---------------------------------------------------------------------
-- SAFE USER DELETION
--
-- Why not pure CASCADE everywhere? Cascading a *user* deletion into their
-- leads/calls would destroy org data when an employee leaves. Instead:
--   * profiles.id  -> auth.users(id) ON DELETE CASCADE  (delete auth user => profile gone)
--   * leads.assigned_to / created_by -> ON DELETE SET NULL  (data retained, no orphans)
--   * calls.uploaded_by              -> ON DELETE SET NULL
--   * teams.leader_id                -> ON DELETE SET NULL
--   * team_members.user_id           -> ON DELETE CASCADE  (membership is junk after delete)
-- Org deletion DOES cascade everything (organizations is the tenant root).
-- Net result: deleting a user leaves NO dangling FK and loses no lead/call.
--
-- Optional: reassign a departing user's open leads before deletion.
-- ---------------------------------------------------------------------
create or replace function public.reassign_user_leads(p_from uuid, p_to uuid)
returns void language sql security definer set search_path = public as $$
  update public.leads set assigned_to = p_to where assigned_to = p_from;
$$;

-- The actual auth.users row is removed from a server route with the service
-- role via:  await supabaseAdmin.auth.admin.deleteUser(userId)
-- See app/api/admin/delete-user/route.ts (Phase 1 deliverable).
