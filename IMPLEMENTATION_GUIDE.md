# HSM Realty AI - Implementation Guide

## Overview

This guide walks you through deploying the complete team management and lead submission system for HSM Realty AI. The system is already built and ready to deploy—this guide shows you the exact steps to get it running.

## Phase 1: Database Setup (Required First)

### Step 1: Run Database Migrations

1. Open your **Supabase Dashboard** → **SQL Editor**
2. Click **New Query**
3. Copy the SQL from `DATABASE_SETUP.md` and paste it in
4. Click **Run** to execute all migrations

**What gets created:**
- `teams` table — organization teams
- `team_members` table — assignments
- `cold_callers` table — agent profiles
- `trainers` table — coaching staff
- Updated `leads` table with new columns
- Updated `profiles` table with new columns
- Row-level security (RLS) policies for data isolation

**Verify:** In **Supabase Table Editor**, you should see these new tables listed.

---

## Phase 2: Feature Overview

Once the database is set up, these features become active:

### 1. **Public Shareable Lead Submission Form**
- **URL:** `https://yourdomain.com/submit-lead`
- **No authentication required**
- Allows external agents or partners to submit leads
- Includes agent name and team name for routing
- Auto-creates submission with admin as default owner
- Lead analysis starts automatically

**Files:**
- `/app/submit-lead/page.tsx` — Public form (already created)
- Form fields: property address, contact info, property details, notes

### 2. **CSV Bulk Import System**
- **URL:** `https://yourdomain.com/dashboard/settings`
- **For:** Team managers and admins
- Upload CSV with structure:
  ```
  Manager,Agent Name,Team Name,Trainer Name,Hiring Date
  manager@email.com,John Smith,Sales Team A,Sarah Coach,2024-01-15
  ```
- Auto-creates teams, agents, and trainers
- Assigns agents to teams with hiring dates
- Creates cold_callers records for KPI tracking

**Files:**
- `/app/dashboard/settings/page.tsx` — Import UI
- `/app/api/csv-import/route.ts` — Backend processing
- `DATABASE_SETUP.md` — Template format reference

### 3. **Team Management Dashboard**
- **URL:** `https://yourdomain.com/dashboard/team-leader`
- Team managers see their team's performance
- Agent KPI tracking
- Performance-based coaching recommendations

**Files:**
- `/app/dashboard/team-leader/page.tsx` — Team leader view
- `/app/dashboard/callers/page.tsx` — Individual agent performance
- `/app/dashboard/team-performance/page.tsx` — Leaderboard view

### 4. **Trainer Portal**
- **URL:** `https://yourdomain.com/dashboard/trainers`
- Upload training materials
- Manage test calls and coaching
- Track coaching documentation

**Files:**
- `/app/dashboard/trainers/page.tsx` — Trainer dashboard

---

## Phase 3: Configuration & Testing

### Step 1: Environment Variables

Verify these are in your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

The service role key is needed for the CSV import API to work.

### Step 2: Test Public Submission Form

1. **Without authentication:**
   - Go to `http://localhost:3000/submit-lead`
   - Fill in the form with test data
   - Submit

2. **Check database:**
   - Go to Supabase → Table Editor → `leads`
   - You should see a new row with:
     - `status: "Processing"`
     - `agent_name` populated
     - `metadata` with all submission details

### Step 3: Test CSV Import

1. **Download template:**
   - Go to `http://localhost:3000/dashboard/settings` (logged in)
   - Click **Download Template**
   - Opens `team-import-template.csv`

2. **Prepare test CSV:**
   - Edit the template with your test data
   - Save as `test-import.csv`

3. **Import:**
   - Go to dashboard settings page
   - Drag & drop the CSV or click to browse
   - Should show success message

4. **Verify in database:**
   - **Supabase Table Editor:**
     - `teams` — new rows created
     - `cold_callers` — new agents
     - `trainers` — new trainers

---

## Phase 4: Integration & Wiring

### What's Still Needed

The following features are built but need backend integration:

1. **Automatic Lead Analysis on Public Submission**
   - Currently: Leads are created with `status: "Processing"`
   - Next: Add a background job to run analysis
   - Implementation: Create a Supabase Edge Function or cron job

2. **Team Lead Dashboards**
   - Currently: UI is built, loads from database
   - Working: Shows team lists, agent assignment
   - Next: Add real-time KPI calculations and trends

3. **Trainer Material Upload & Storage**
   - Currently: UI structure only
   - Next: Wire up file storage (Supabase Storage)
   - Create API route: `/api/trainers/upload`

4. **Real-time Dashboard Updates**
   - Currently: Pages load static data
   - Next: Add Supabase real-time subscriptions
   - Enable live KPI updates

---

## Phase 5: Deployment Checklist

- [ ] Database tables created in production Supabase
- [ ] RLS policies verified for data isolation
- [ ] Environment variables set in production
- [ ] Public form tested with real data
- [ ] CSV import tested with actual team structure
- [ ] Admin portal verified (for payment approvals, user management)
- [ ] Profile page shows correct user data
- [ ] Call library and campaigns loading
- [ ] Analytics dashboard showing correct metrics

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    HSM Realty AI Platform                    │
├─────────────────────────────────────────────────────────────┤
│
├─ PUBLIC ENDPOINTS (No Auth Required)
│  └─ /submit-lead          → Shareable form for external submission
│
├─ AUTHENTICATED ROUTES (Logged-in Users)
│  └─ /dashboard
│     ├─ /overview          → Main KPI dashboard
│     ├─ /calls             → Call library & search
│     ├─ /campaigns         → Campaign management
│     ├─ /analyze           → New analysis interface
│     ├─ /submit-lead       → Internal submission (for agents)
│     ├─ /callers           → Individual agent KPIs
│     ├─ /trainers          → Training management
│     ├─ /team-leader       → Team performance
│     ├─ /team-performance  → Leaderboard & trends
│     ├─ /settings          → CSV import & team management
│     └─ /profile           → User profile & billing
│
├─ ADMIN ROUTES (Admin Users Only)
│  └─ /admin
│     ├─ /overview          → User management
│     ├─ /payments          → Payment approvals
│
└─ API ROUTES (Backend Processing)
   └─ /api
      └─ /csv-import        → Handle bulk CSV imports
```

---

## Database Schema Overview

### teams
- `id` (UUID) — Primary key
- `name` (text) — Team name
- `manager_id` (UUID) — FK to profiles
- `description` (text) — Optional notes
- `created_at`, `updated_at`

### cold_callers
- `id` (UUID) — Primary key
- `name` (text) — Agent name
- `user_id` (UUID) — FK to profiles
- `team_id` (UUID) — FK to teams
- `email`, `phone` (optional)
- `hiring_date` (date)
- `created_at`, `updated_at`

### trainers
- `id` (UUID) — Primary key
- `name` (text) — Trainer name
- `email` (text)
- `user_id` (UUID) — FK to profiles
- `bio` (text)
- `created_at`, `updated_at`

### team_members
- `id` (UUID) — Primary key
- `team_id` (UUID) — FK to teams
- `user_id` (UUID) — FK to profiles
- `role` (text) — 'agent' | 'trainer' | 'leader'
- `hiring_date` (date)
- `created_at`, `updated_at`

### leads (updated)
- `caller_id` (UUID) — FK to cold_callers
- `agent_name` (text) — From submission form
- `metadata` (JSONB) — Extended submission data
- Plus existing fields: address, price, status, etc.

### profiles (updated)
- `role` (text) — 'user' | 'admin'
- `monthly_lead_limit` (integer)
- `current_month_usage` (integer)

---

## Troubleshooting

### "Table does not exist" error
- Verify you ran the SQL migrations in Supabase
- Check that the new tables appear in Table Editor
- Make sure you're using the correct database role (service role key for API)

### CSV Import fails
- Verify CSV format matches exactly: `Manager,Agent Name,Team Name,Trainer Name,Hiring Date`
- Check for extra spaces or different capitalization
- Ensure all managers exist in the system or use valid email addresses
- Check browser console for error details

### Public submission form not working
- Verify leads table exists and is accessible
- Check that an admin user exists in the system
- Look at network tab in browser dev tools for API errors
- Check Supabase logs for RLS policy violations

### Team dashboards show no data
- Run CSV import to create teams and agents
- Verify team_members records are created
- Check that the user is assigned as a team manager
- Ensure leads are created for the team's agents

---

## Next Steps

After Phase 1 (database setup):

1. **Test all forms** to ensure they work with your actual data
2. **Set up background jobs** for automatic lead analysis
3. **Create sample CSV** with your team structure and test import
4. **Configure team leaders** with their teams in the system
5. **Train users** on the new dashboard features
6. **Monitor analytics** to ensure KPIs are calculating correctly

---

## Support

For issues:
1. Check console errors (browser DevTools)
2. Check Supabase logs (SQL editor, Auth logs)
3. Verify RLS policies aren't blocking access
4. Ensure service role key is correct for API routes
5. Test with simplified data to isolate issues

