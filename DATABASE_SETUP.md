# Database Setup for HSM Realty AI

Run these SQL commands in your Supabase SQL Editor to create the necessary tables for team management and CSV import functionality.

## 1. Teams Table

```sql
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  manager_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_teams_manager_id ON public.teams(manager_id);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own teams"
  ON public.teams FOR SELECT
  USING (manager_id = auth.uid());

CREATE POLICY "Users can create teams"
  ON public.teams FOR INSERT
  WITH CHECK (manager_id = auth.uid());

CREATE POLICY "Users can update their own teams"
  ON public.teams FOR UPDATE
  USING (manager_id = auth.uid());
```

## 2. Team Members Table

```sql
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'agent', -- 'agent', 'trainer', 'leader'
  hiring_date date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX idx_team_members_user_id ON public.team_members(user_id);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view team members"
  ON public.team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = team_members.team_id
      AND teams.manager_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage team members"
  ON public.team_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = team_members.team_id
      AND teams.manager_id = auth.uid()
    )
  );
```

## 3. Trainers Table

```sql
CREATE TABLE IF NOT EXISTS public.trainers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bio text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_trainers_user_id ON public.trainers(user_id);
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their trainers"
  ON public.trainers FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create trainers"
  ON public.trainers FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their trainers"
  ON public.trainers FOR UPDATE
  USING (user_id = auth.uid());
```

## 4. Cold Callers Table

```sql
CREATE TABLE IF NOT EXISTS public.cold_callers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  email text,
  phone text,
  hiring_date date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_cold_callers_user_id ON public.cold_callers(user_id);
CREATE INDEX idx_cold_callers_team_id ON public.cold_callers(team_id);
ALTER TABLE public.cold_callers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their callers"
  ON public.cold_callers FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create callers"
  ON public.cold_callers FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their callers"
  ON public.cold_callers FOR UPDATE
  USING (user_id = auth.uid());
```

## 5. Update Leads Table (if needed)

Add these columns to the existing `leads` table if they don't exist:

```sql
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS caller_id uuid REFERENCES public.cold_callers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS agent_name text;

CREATE INDEX IF NOT EXISTS idx_leads_caller_id ON public.leads(caller_id);
```

## 6. Update Profiles Table (if needed)

Ensure these columns exist in the `profiles` table:

```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user', -- 'user', 'admin'
ADD COLUMN IF NOT EXISTS monthly_lead_limit integer DEFAULT 100,
ADD COLUMN IF NOT EXISTS current_month_usage integer DEFAULT 0;
```

## Steps to Run

1. Go to your Supabase Dashboard
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste each SQL block above (one at a time, or all together)
5. Click **Run** to execute
6. Verify in the **Table Editor** that the new tables appear

## Features Enabled

Once these tables are created, the following features will be active:

- ✅ CSV bulk import of teams, agents, and trainers
- ✅ Team management dashboards for team leaders
- ✅ Cold caller KPI tracking
- ✅ Public shareable lead submission form (`/submit-lead`)
- ✅ Automatic AI analysis of submitted leads
- ✅ Trainer portal management
- ✅ Team performance tracking

## CSV Import Format

```
Manager,Agent Name,Team Name,Trainer Name,Hiring Date
john@example.com,John Smith,Sales Team A,Sarah Johnson,2024-01-15
john@example.com,Jane Doe,Sales Team A,Sarah Johnson,2024-02-01
jane@example.com,Bob Wilson,Sales Team B,Mike Brown,2024-01-20
```
