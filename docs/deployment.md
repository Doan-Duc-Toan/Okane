# Deployment

## Platform
- **Web (apps/web):** Vercel — https://okane-web.vercel.app
- **API (apps/api):** Render (free web service) — https://okane-api-7v0o.onrender.com
- **Database:** Supabase Postgres (session pooler)

## Deploy Command
- **Web:** automatic on push to `main` (Vercel Git integration). Manual: `vercel --prod` from `apps/web`.
- **API:** automatic on push to `main` (Render Blueprint, `render.yaml` at repo root). Build/start commands are defined in `render.yaml`.
- **Database migrations:** `pnpm --filter api exec prisma migrate deploy` (Render's build command also runs this on every deploy; safe to re-run — no-op if nothing pending).

## Environment Variables

**Render (`okane-api`)** — set in the Render dashboard, not committed (`render.yaml` marks these `sync: false`):
- `DATABASE_URL` — Supabase session pooler connection string (`aws-0-ap-northeast-1.pooler.supabase.com:5432`, **not** the direct-connection host — that one is IPv6-only and unreachable from most networks/hosts without an IPv6 route)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — random 32-byte hex strings, generated once with `openssl rand -hex 32`
- `CORS_ORIGINS` — `https://okane-web.vercel.app` (must match the web app's production origin exactly, or the browser blocks every API call)

**Vercel (`okane-web`)** — Root Directory set to `apps/web`:
- `VITE_API_URL` — `https://okane-api-7v0o.onrender.com` (baked into the JS bundle at build time — changing it requires a redeploy, not just an env var update)

## Custom Domain
Not set up — using the platform-assigned `.vercel.app` / `.onrender.com` subdomains.

## Known Limitations (free tier)
- **Render cold start:** the API sleeps after ~15 minutes of no traffic; the first request after that takes 30s-1min to wake it back up. Not fixable on the free tier — a paid instance type removes this.
- **Vercel preview URLs are protected:** any URL containing `-git-<branch>-` (e.g. `okane-web-git-main-doan-duc-toans-projects.vercel.app`) requires a Vercel login (Deployment Protection, on by default for Hobby). Only the plain production URL (`okane-web.vercel.app`) is publicly reachable — always share that one, never the git-branch alias.
- **Supabase direct connection is IPv6-only** on the free tier; always use the session pooler connection string for anything connecting from an IPv4-only network (which is most home/office networks).

## Rollback
- **Web:** Vercel dashboard → Deployments → pick an earlier one → "Promote to Production".
- **API:** Render dashboard → okane-api → Events → pick an earlier deploy → "Manual Deploy" (previous commit).
- **Database:** Supabase → Backups (point-in-time recovery, free tier retention is limited — check current window before relying on it).
