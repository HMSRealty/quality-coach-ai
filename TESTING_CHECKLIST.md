# HSM Realty AI - Testing Checklist

## Pre-Launch Testing

Use this checklist to verify all features work before deploying to production.

---

## ✅ Database & Backend

- [ ] **Database Tables Exist**
  - Open Supabase → Table Editor
  - Verify these tables: `teams`, `cold_callers`, `trainers`, `team_members`, `leads`
  - Check that `leads` has `caller_id` and `agent_name` columns

- [ ] **RLS Policies Active**
  - In Supabase, click each table
  - Verify RLS is "ON" for all new tables
  - Verify at least 3-4 policies per table

- [ ] **Service Role Key Set**
  - `.env.local` has `SUPABASE_SERVICE_ROLE_KEY`
  - Needed for API routes to bypass RLS

---

## ✅ Public Lead Submission

**URL:** `http://localhost:3000/submit-lead` (no login required)

- [ ] **Page Loads**
  - No auth required
  - Form displays properly
  - All fields visible

- [ ] **Submit Valid Lead**
  - Fill in required fields: agent_name, property_address, date
  - Click Submit
  - See success message
  - No errors in console

- [ ] **Data Appears in DB**
  - Supabase → Table Editor → `leads`
  - New row created with:
    - `status: "Processing"`
    - `agent_name` populated
    - `extracted_address` contains property address
    - `metadata` contains all form fields

- [ ] **Validation Works**
  - Try submitting with blank required field
  - Should show validation error
  - Form doesn't submit

- [ ] **Team/Agent Identification**
  - Submit with agent_name="John" and team_name="Sales Team A"
  - Data saved correctly
  - Can be associated with team records later

---

## ✅ CSV Bulk Import

**URL:** `http://localhost:3000/dashboard/settings` (login required)

### Part 1: Download Template

- [ ] **Template Downloads**
  - Click "Download Template"
  - File saves as `team-import-template.csv`
  - File contains proper headers

- [ ] **Headers Correct**
  - First line: `Manager,Agent Name,Team Name,Trainer Name,Hiring Date`
  - Example data rows below headers

### Part 2: Upload CSV

- [ ] **File Input Works**
  - Click upload area or drag file
  - CSV file selected properly
  - Loading spinner appears

- [ ] **Successful Import**
  - See success message
  - Message shows count of imported records
  - No errors in console

- [ ] **Teams Created**
  - Supabase → Table Editor → `teams`
  - New rows for each unique "Team Name"
  - `manager_id` is logged-in user

- [ ] **Callers Created**
  - Supabase → Table Editor → `cold_callers`
  - Row per "Agent Name"
  - `team_id` points to correct team
  - `hiring_date` populated

- [ ] **Trainers Created**
  - Supabase → Table Editor → `trainers`
  - Row per "Trainer Name"
  - `user_id` is logged-in user
  - `email` auto-generated

### Part 3: Error Handling

- [ ] **Bad CSV Format**
  - Wrong headers → Shows error message
  - Missing columns → Graceful handling
  - Extra spaces → Still parses correctly

- [ ] **Duplicate Import**
  - Import same CSV twice
  - No duplicate teams created
  - Shows success without duplicates

---

## ✅ Team Management Dashboards

**Base URL:** `http://localhost:3000/dashboard`

### Team Leader Dashboard

- [ ] **Page Loads** (`/team-leader`)
  - Shows sidebar with teams
  - KPI cards visible
  - Team member section shows

- [ ] **Team Selection Works**
  - Click different teams in sidebar
  - Dashboard updates with team data
  - Shows correct team members

- [ ] **KPIs Calculate**
  - Displays total calls
  - Shows qualified count
  - Conversion rate calculated
  - No NaN or undefined values

### Cold Callers Page

- [ ] **Page Loads** (`/callers`)
  - Shows caller list
  - KPI cards per caller
  - Feedback section visible

- [ ] **Agent Selection**
  - Click different agents
  - Stats update correctly
  - Performance metrics visible

### Performance Tracker

- [ ] **Page Loads** (`/team-performance`)
  - KPI summary cards visible
  - Team rankings table shows
  - Leaderboard ordered by conversion rate

- [ ] **Color Coding Works**
  - >50% conversion = green
  - >30% conversion = blue
  - <30% conversion = red

---

## ✅ User Authentication & Profile

### Sign In/Sign Out

- [ ] **Sign In Works**
  - Email/password login succeeds
  - Redirects to dashboard
  - User session active

- [ ] **Profile Page** (`/dashboard/profile`)
  - Shows user email
  - Shows plan (free/starter/professional/enterprise)
  - API config section visible
  - Usage stats display

- [ ] **Sign Out**
  - Logout button works
  - Redirects to landing page
  - Session cleared

---

## ✅ Admin Features

**URL:** `http://localhost:3000/admin` (admin only)

- [ ] **Access Control**
  - Admin user can access
  - Non-admin sees "Access Denied"
  - Shield icon shows in sidebar for admins

- [ ] **Admin Overview** (`/admin`)
  - User list loads
  - Search filters work
  - Edit panel opens

- [ ] **Payment Approvals** (`/admin/payments`)
  - Invoice table shows
  - Approve button works
  - Status updates in database

---

## ✅ Navigation & UI

### Sidebar Navigation

- [ ] **Links Work**
  - All nav items clickable
  - Current page highlighted
  - Active indicator visible

- [ ] **Responsive**
  - Sidebar collapses on mobile (if implemented)
  - Mobile navigation works

### Top Bar

- [ ] **Breadcrumbs**
  - Show current page path
  - Update when navigating
  - Format: "Workspace > page-name"

- [ ] **User Menu**
  - Profile avatar visible
  - User email displays
  - Plan badge shows correct color

### Loading States

- [ ] **Spinners Show**
  - Page loads = spinner visible
  - Button clicks = button disables with spinner
  - Lists loading = skeleton or spinner

---

## ✅ Performance & Responsiveness

- [ ] **Dashboard Loads Fast**
  - Initial load < 2 seconds
  - KPI calculations < 500ms
  - No console warnings

- [ ] **CSV Import Speed**
  - 100 rows < 5 seconds
  - 1000 rows < 15 seconds
  - No timeouts

- [ ] **Mobile Responsive**
  - Desktop (1920px) looks good
  - Tablet (768px) layout adapts
  - Mobile (375px) readable

---

## ✅ Data Validation & Edge Cases

- [ ] **Empty States**
  - No teams → Shows helpful message
  - No leads → Shows empty state
  - No members → Shows empty state

- [ ] **Special Characters**
  - Names with apostrophes (O'Brien)
  - Emails with special chars
  - Addresses with special chars
  - All stored correctly

- [ ] **Large Data Sets**
  - 1000+ leads → Still responsive
  - 100+ team members → Lists handle it
  - No UI crashes

---

## ✅ Security Checks

- [ ] **No Exposed Secrets**
  - No API keys in client code
  - `.env.local` not committed
  - Service role key only used server-side

- [ ] **Authentication Required**
  - Unauthenticated users can't access `/dashboard/*`
  - Redirect to login works
  - Session timeout works

- [ ] **RLS Enforced**
  - User A can't see User B's data
  - Manager sees only their teams
  - Admin sees everything

- [ ] **SQL Injection Protected**
  - Supabase client library handles escaping
  - User input safely bound in queries
  - No direct SQL construction

---

## ✅ Browser Compatibility

- [ ] **Chrome/Edge** (Latest)
  - All features work
  - No console errors
  - Animations smooth

- [ ] **Firefox** (Latest)
  - All features work
  - No console errors
  - Animations smooth

- [ ] **Safari** (Latest)
  - All features work
  - No console errors
  - Animations smooth

---

## 🔴 Critical Failures (Stop Here If Found)

If any of these fail, fix before proceeding:

- [ ] Database tables missing
- [ ] API routes return 500 errors
- [ ] Authentication fails
- [ ] CSV import breaks
- [ ] RLS prevents all reads/writes
- [ ] Service role key missing or wrong

---

## 📋 Sign-Off

- [ ] All ✅ items checked
- [ ] No 🔴 critical failures
- [ ] Ready for production deployment

**Date Tested:** _______________  
**Tested By:** _______________  
**Notes:** ____________________

---

## Common Test Data

Use this for manual testing:

### Test Lead Submission
```
Agent Name: John Smith
Team Name: Sales Team A
Property Address: 123 Oak Street, Miami, FL 33101
Owner Name: Sarah Jones
Phone: (305) 555-1234
Asking Price: 450000
Property Type: Single Family Home
Beds & Baths: 4 bed, 2.5 bath
```

### Test CSV Import
```
Manager,Agent Name,Team Name,Trainer Name,Hiring Date
test@example.com,John Smith,Sales Team A,Sarah Coach,2024-01-15
test@example.com,Jane Doe,Sales Team A,Sarah Coach,2024-02-01
test@example.com,Bob Wilson,Sales Team B,Mike Brown,2024-03-10
```

