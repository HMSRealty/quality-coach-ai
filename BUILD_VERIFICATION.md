# Build Verification Checklist

Run these commands to verify the build is clean before deployment.

## Step 1: Check TypeScript Compilation

```bash
npm run build
```

**Expected:** Build completes with no errors
**If error:** Check the error message and line number. Common issues:
- Missing imports
- Type mismatches
- Syntax errors in TSX

---

## Step 2: Verify File Structure

Check these files exist and are not empty:

```bash
# Frontend Pages
ls -la app/submit-lead/page.tsx              # Public form
ls -la app/dashboard/settings/page.tsx       # CSV import UI
ls -la app/dashboard/team-leader/page.tsx    # Team dashboard
ls -la app/dashboard/team-performance/page.tsx
ls -la app/dashboard/callers/page.tsx
ls -la app/dashboard/trainers/page.tsx

# API Routes
ls -la app/api/csv-import/route.ts           # CSV processor

# Documentation
ls -la DATABASE_SETUP.md
ls -la IMPLEMENTATION_GUIDE.md
ls -la QUICK_START.md
ls -la TESTING_CHECKLIST.md
```

All files should show non-zero size.

---

## Step 3: Check Environment Setup

Verify `.env.local` is configured:

```bash
cat .env.local | grep NEXT_PUBLIC_SUPABASE_URL
cat .env.local | grep NEXT_PUBLIC_SUPABASE_ANON_KEY
cat .env.local | grep SUPABASE_SERVICE_ROLE_KEY
```

All three should have values.

---

## Step 4: Start Dev Server

```bash
npm run dev
```

**Expected:**
- Server starts on http://localhost:3000
- No error messages in console
- Page loads without crashes

---

## Step 5: Run Production Build

```bash
npm run build
npm run start
```

**Expected:**
- Build completes successfully
- Server starts in production mode
- No errors in logs

---

## Step 6: Test Critical Paths

Using browser dev tools:

1. **Check Console for Errors**
   - Open DevTools → Console tab
   - Should show no red error messages
   - Warnings are OK

2. **Check Network for Failures**
   - Open DevTools → Network tab
   - Make a request (e.g., navigate to page)
   - No 5xx errors
   - All 2xx/3xx status codes

3. **Test Public Form**
   ```
   URL: http://localhost:3000/submit-lead
   - Page loads without auth
   - Form displays all fields
   - Submit button works
   ```

4. **Test Settings/CSV Import**
   ```
   URL: http://localhost:3000/dashboard/settings
   - Page loads (requires login)
   - Download button works
   - Upload area interactive
   ```

---

## Step 7: Database Connection Test

In Supabase Dashboard, run:

```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
```

Should return 10+ tables (existing ones plus new ones from DATABASE_SETUP.md).

---

## Step 8: API Route Test

Using curl or Postman:

```bash
curl -X POST http://localhost:3000/api/csv-import \
  -H "Content-Type: application/json" \
  -d '{
    "csv": "Manager,Agent Name,Team Name,Trainer Name,Hiring Date\ntest@test.com,John,Team A,Coach,2024-01-01",
    "userId": "test-uuid-here"
  }'
```

**Expected:** 
- Returns JSON response
- Status 200 or 400 (not 500)
- Shows either success or error message

---

## Common Build Issues & Fixes

### Issue: "Cannot find module"
```
Error: Cannot find module '@/lib/supabase'
```
**Fix:** Check `lib/supabase.ts` exists and is exported correctly

### Issue: "Type 'never' is not assignable to type"
```
Type 'never' is not assignable to type 'string'
```
**Fix:** Check that all state initialization has proper types (e.g., `useState<string>("")`)

### Issue: "Property does not exist on type"
```
Property 'single' does not exist on QueryBuilder
```
**Fix:** Check Supabase client version. `single()` requires v2+.

### Issue: "SUPABASE_SERVICE_ROLE_KEY is undefined"
```
Error: Missing SUPABASE_SERVICE_ROLE_KEY
```
**Fix:** Add to `.env.local` (see Step 3)

### Issue: CSV import API returns 403
```
Response: 403 Forbidden
```
**Fix:** Check RLS policies. Service role key should bypass them, but verify it's set in env.

---

## Performance Checks

Run Lighthouse:

```bash
# In Chrome DevTools
Ctrl+Shift+J → Ctrl+Shift+P → "Lighthouse"
```

**Target Scores:**
- Performance: >60
- Accessibility: >80
- Best Practices: >80
- SEO: >80

---

## Deployment Safety Checks

Before deploying to production:

- [ ] No console errors
- [ ] All network requests 2xx/3xx
- [ ] Forms submit successfully
- [ ] Database migrations tested in staging
- [ ] Service role key is NOT in git
- [ ] Environment variables are production-ready
- [ ] All three main features tested (form, CSV, dashboard)

---

## Pre-Production Database

Run in production Supabase:

```sql
-- Create tables
(Paste entire DATABASE_SETUP.md SQL here)

-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN 
('teams', 'cold_callers', 'trainers', 'team_members');

-- Verify RLS enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('teams', 'cold_callers', 'trainers', 'team_members');
```

---

## Go-Live Checklist

- [ ] `npm run build` passes with 0 errors
- [ ] Dev server starts cleanly
- [ ] Production build starts cleanly
- [ ] All console messages are warnings or info (no errors)
- [ ] Public form loads without auth
- [ ] CSV import works
- [ ] Team dashboards display data
- [ ] API route returns valid responses
- [ ] Database migration tested in production
- [ ] Environment variables set in production
- [ ] Service role key secure (not in git)

---

## Rollback Plan

If something breaks after deployment:

1. **Immediate:** Revert to previous deployment
2. **Database:** Keep database intact (non-breaking schema changes only)
3. **Debug:** Check logs and database state
4. **Fix:** Address issue and re-deploy
5. **Verify:** Run this checklist again

---

## Success Indicators

After going live, monitor:

- [ ] `/submit-lead` receives submissions
- [ ] `/dashboard/settings` CSV imports work
- [ ] `/dashboard/team-leader` shows team data
- [ ] `/admin` portal functions normally
- [ ] No 5xx errors in Supabase logs
- [ ] RLS policies working (users see only their data)
- [ ] Performance metrics acceptable

---

## Support

If build fails:
1. Check error message for file/line
2. Look at TypeScript types
3. Verify imports are correct
4. Check Supabase version compatibility
5. Review recent changes to affected files

If deployment fails:
1. Check environment variables are set
2. Verify database migrations ran
3. Check network connectivity
4. Review server logs
5. Test API routes directly

