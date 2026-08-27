# StockSense AI — Deployment Reference

_Last updated: 2026-08-27_

Quick map of where every piece of StockSense lives, so we don't have to
re-discover it later. Nothing secret is in this file — connection strings,
API keys and tokens live only in each platform's dashboard.

---

## 1. At a glance

| Piece        | Provider | URL / identifier                                                      | Source dir |
|--------------|----------|---------------------------------------------------------------------- |------------|
| **Frontend** | Vercel   | https://stocksense-gules-nine.vercel.app                             | `client/`  |
| **Backend**  | Render   | https://stocksense-ghq8.onrender.com                                 | `server/`  |
| **Database** | Neon     | Postgres `neondb` @ `ep-holy-heart-axn7y2k3.c-4.us-east-2.aws.neon.tech` (AWS us-east-2 / Ohio) | — |

**GitHub repo:** https://github.com/dkk10110/stocksense.git (branch `main`)

Data flow: browser → Vercel (static React) → `https://stocksense-ghq8.onrender.com/api` → Neon Postgres.

---

## 2. Frontend — Vercel

- **Project root:** `client/`
- **Framework:** Vite + React 19, React Router 7
- **Build command:** `vite build` → output `client/dist/`
- **SPA routing:** `client/vercel.json` rewrites every path to `/index.html`
  (so `/signals`, `/watchlist` etc. work on direct load / refresh).
- **Environment variable (set in Vercel → Project → Settings → Environment Variables):**

  | Key            | Value                                          |
  |----------------|------------------------------------------------|
  | `VITE_API_URL` | `https://stocksense-ghq8.onrender.com/api`      |

  > `VITE_*` vars are baked in **at build time** — after changing it you must
  > trigger a fresh deploy, not just restart.

- **Deploys:** automatically on push to `main` (Vercel's GitHub integration).

---

## 3. Backend — Render

- **Project root:** `server/`
- **Runtime:** Docker — `server/Dockerfile`, base image `node:22-slim` (installs `openssl` + `ca-certificates` for Prisma's engine + Neon TLS)
- **Container start command:**
  `npx prisma migrate deploy && node src/index.js`
  (applies pending migrations, then starts the API **and** the in-process
  `node-cron` scheduler). `prisma` is a **prod** dependency so this resolves
  locally with no npm-registry fetch at startup.
- **Listens on:** port `4000` (`process.env.PORT` — Render injects this)
- **Proxy:** `app.set('trust proxy', 1)` so rate-limiting sees real client IPs
  behind Render's load balancer.
- **Deploys:** automatically on push to `main` (Render's GitHub integration).

### Environment variables (Render → Service → Environment)

**Required:**

| Key           | Notes                                                                 |
|---------------|----------------------------------------------------------------------- |
| `DATABASE_URL`| Neon connection string (pooled `-pooler` host recommended, `sslmode=require`) |
| `JWT_SECRET`  | long random string — auth tokens are signed with this                 |
| `CORS_ORIGIN` | must equal the frontend origin: `https://stocksense-gules-nine.vercel.app` |

**Optional integrations** (app runs without them — each degrades gracefully):

| Key | Enables |
|-----|---------|
| `ANGEL_ONE_API_KEY`, `ANGEL_ONE_CLIENT_CODE`, `ANGEL_ONE_PASSWORD`, `ANGEL_ONE_TOTP_SECRET` | live intraday price + India VIX (daily data & VIX already work via Yahoo Finance without this) |
| `NEWS_API_KEY`        | catalyst-countdown detector / news sentiment (not yet built) |
| `ANTHROPIC_API_KEY`   | real Claude "why buy now" text (falls back to a rule-based template without it) |
| `WHATSAPP_TO` + `WHATSAPP_PROVIDER` + (`WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_ACCESS_TOKEN` for Cloud API, or `TWILIO_*` for Twilio) | real WhatsApp alert delivery (alerts still write to the in-app Alerts screen without it). See `dependancy/DEPENDENCIES.md` #3 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | password-reset emails (logs the reset link to server console without it) |

---

## 4. Database — Neon

- **Provider:** Neon (serverless Postgres)
- **Database:** `neondb`
- **Host:** `ep-holy-heart-axn7y2k3.c-4.us-east-2.aws.neon.tech`
- **Region:** AWS `us-east-2` (Ohio)
- **Consumed by:** the Render backend via `DATABASE_URL` only. No other service
  connects to it.
- **Schema management:** Prisma migrations in `server/prisma/migrations/`.
  Render runs `prisma migrate deploy` on every container start.

### Free-tier behaviour (Neon)

- **Does not expire** — unlike Render's free Postgres. No 30-day deletion.
- Compute **auto-suspends after ~5 min idle**; the next query cold-starts it
  (~0.5s). First request after a quiet period can feel slow — expected.
- Storage / compute-hours are capped on the free plan; check the Neon
  dashboard if writes start failing.

### Backups

```bash
# from server/, with DATABASE_URL pointed at Neon:
npm run backup:db          # runs pg_dump -> server/backups/stocksense_<timestamp>.sql
```

Not scheduled anywhere yet — run it manually before risky changes. Neon also
has its own point-in-time restore window on the dashboard.

---

## 5. Redeploy / rollback cheatsheet

| Want to…                        | Do this |
|---------------------------------|---------|
| Ship frontend + backend         | `git push origin main` — Vercel and Render both auto-build |
| Redeploy without a code change  | Vercel: "Redeploy" on the deployment. Render: "Manual Deploy → Deploy latest commit" |
| Roll back                       | Vercel: promote a previous deployment. Render: "Rollback" to a prior deploy |
| Change an env var               | Edit in the dashboard → redeploy (Vercel needs a rebuild for `VITE_*`) |
| Run a one-off DB migration      | Push the migration file; Render applies it on next deploy via `prisma migrate deploy` |

---

## 6. Known warnings / follow-ups (from Render logs)

| Warning | Severity | Status |
|---------|----------|--------|
| `Prisma failed to detect libssl/openssl … Defaulting to openssl-1.1.x` | Was fragile — engine binary was being guessed | **Fixed 2026-08-27** — `server/Dockerfile` now installs `openssl` + `ca-certificates`. Redeploy on Render to apply. |
| `yahoo-finance2 Requires Node >= 22.0.0, found 20.x` | Minor now, grows over time | **Fixed 2026-08-27** — `server/Dockerfile` base image bumped to `node:22-slim`. Redeploy on Render to apply. |
| `package.json#prisma is deprecated … migrate to prisma.config.ts` | Low — only breaks at Prisma 7 | Open — defer until bumping Prisma major version |
| Repeated `injected env (0) from .env … [tips]` | Cosmetic | Open — optional: set `DOTENV_CONFIG_QUIET=true` on Render |

> Local dev still runs on the host's Node version (Windows, currently Node 20).
> The `node:22-slim` bump only affects the Render container. `yahoo-finance2`
> will keep printing its warning locally until the local Node is upgraded.

---

## 7. Accounts / dashboards

- **GitHub:** https://github.com/dkk10110/stocksense
- **Vercel dashboard:** https://vercel.com/ (project: `stocksense`)
- **Render dashboard:** https://dashboard.render.com/ (service: `stocksense-ghq8`)
- **Neon dashboard:** https://console.neon.tech/ (project containing `neondb`)
