# HSM Realty AI - Quick Start (5-Minute Setup)

## ⚡ What's Ready Now

✅ Public shareable lead submission form (`/submit-lead`)  
✅ CSV bulk import system (`/dashboard/settings`)  
✅ Team management dashboards  
✅ Cold caller KPI tracking  
✅ Trainer portal  
✅ Admin payment portal  

## 🚀 Get Started in 5 Steps

### 1. Run Database Setup (2 min)
```
1. Open Supabase Dashboard → SQL Editor
2. New Query → Paste content from DATABASE_SETUP.md
3. Run
4. Verify tables appear in Table Editor
```

### 2. Test Public Form (1 min)
```
1. Go to http://localhost:3000/submit-lead
2. Fill form with test property data
3. Submit
4. Check Supabase → leads table for new row
```

### 3. Download CSV Template (30 sec)
```
1. Go to http://localhost:3000/dashboard/settings (logged in)
2. Click "Download Template"
3. Edit with your team data
```

### 4. Import CSV (30 sec)
```
1. At /dashboard/settings, upload your CSV
2. Should see success message
3. Teams, agents, trainers now in database
```

### 5. View Team Dashboard (1 min)
```
1. Go to /dashboard/team-leader
2. Select your team
3. See agent performance KPIs
```

## 🎯 Key URLs

| Feature | URL | Who |
|---------|-----|-----|
| Public Submission | `/submit-lead` | External agents |
| CSV Import | `/dashboard/settings` | Managers/Admins |
| Team Dashboard | `/dashboard/team-leader` | Team leads |
| Agent KPIs | `/dashboard/callers` | Anyone |
| Performance | `/dashboard/team-performance` | Managers |
| Trainer Portal | `/dashboard/trainers` | Trainers |

## 📊 CSV Format

```
Manager,Agent Name,Team Name,Trainer Name,Hiring Date
john@example.com,John Smith,Sales Team A,Sarah Johnson,2024-01-15
jane@example.com,Jane Doe,Sales Team B,Mike Brown,2024-02-01
```

## ✋ What Needs Work

- [ ] Automatic lead analysis background job
- [ ] Real-time dashboard updates
- [ ] Trainer file uploads to storage
- [ ] Performance trend calculations
- [ ] Notification system

## 🔗 Resources

- **Database Setup:** `DATABASE_SETUP.md`
- **Full Guide:** `IMPLEMENTATION_GUIDE.md`
- **API Route:** `/app/api/csv-import/route.ts`
- **Settings UI:** `/app/dashboard/settings/page.tsx`
- **Public Form:** `/app/submit-lead/page.tsx`

## ⚠️ Common Issues

**"Table does not exist"**
→ Did you run DATABASE_SETUP.md? Run it in Supabase SQL Editor

**CSV import shows "Not authenticated"**
→ Must be logged in. Go to /dashboard/settings, not /settings

**Public form submission fails**
→ Check Supabase → Auth that admin user exists
→ Check browser Network tab for API errors

**Team dashboard shows no data**
→ Run CSV import to create teams and agents first
→ Verify you're assigned as a team manager

## 🎓 Next Level

After basic setup, add:
1. **Background Jobs** — Auto-analyze submitted leads
2. **Storage** — File uploads for training materials
3. **Real-time** — Live dashboard updates (Supabase subscriptions)
4. **Notifications** — Email/Slack alerts for new submissions

---

**Everything is built. Database setup is all that's blocking you.**

