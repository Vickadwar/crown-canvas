# Crown Canvas — Production Deployment & Kiosk Rollout Guide

## 1. Supabase Cloud Setup (Free Tier POC -> Enterprise)
1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Fill in `DATABASE_URL` (Transaction Pooler port `6543`), `DIRECT_URL` (Direct/Session Pooler port `5432`), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
3. Create a **Public** Storage bucket named `signage-media` in Supabase Storage.
4. Push the Drizzle schema and seed East Africa (Kenya, Tanzania, Uganda) + Crown Paints departments:
   ```bash
   cd digital-signage
   npm run db:push
   npm run db:seed
   ```

## 2. Vercel Deployment
1. Import the repository into Vercel and set the **Root Directory** to `digital-signage`.
2. Add all variables from `.env.example` into Vercel Project Environment Variables.
3. For internal production rollout, set `NEXT_PUBLIC_REQUIRE_AUTH=true`, sign in once at `/login` (the first user auto-bootstraps as `super_admin`), and assign scoped roles in **Team & RBAC**.

## 3. Showroom Screen Rollout (Android TVs & Mini PCs)

### Mini PCs (Windows / Linux attached to older TVs)
Configure Chrome/Edge to auto-launch at startup in fullscreen kiosk mode with zero-gesture autoplay:
```powershell
chrome.exe --kiosk --autoplay-policy=no-user-gesture-required --app=https://your-domain.vercel.app/player
```

### Android TVs
- Open `https://your-domain.vercel.app/player` in **Fully Kiosk Browser** (recommended for auto-boot & PIN lock) or Chrome / Android TV Browser and install as PWA (`Add to Home Screen`).
- Pair the screen using the 6-digit PIN from **Fleet & Pairing** in the CMS—no mouse or keyboard required on the TV.

## 4. ERP / POS / SHE Live Data Feed Integration
1. Create a feed in **Data Feeds (ERP/KPI)** (e.g. `east-africa-sales-q4`) and copy the generated `cp_feed_...` key.
2. Schedule your ERP/BI or Google Apps Script to POST JSON snapshots:
   ```bash
   curl -X POST https://your-domain.vercel.app/api/integrations/feeds/east-africa-sales-q4 \
     -H "Content-Type: application/json" \
     -H "x-feed-key: cp_feed_YOUR_KEY" \
     -d '{"payload":{"kpis":[{"label":"East Africa YTD","value":"KES 62.1M","delta":"+22% YoY"}]}}'
   ```
   All connected `/player` screens update their Recharts charts automatically and cache the snapshot for offline resilience.
