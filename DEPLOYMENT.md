# Deployment Guide

This project supports multiple deployment targets. Choose the one that fits your needs.

| Method | Storage | Cost | Persistent Disk | Cold Starts |
|--------|---------|------|-----------------|-------------|
| **Local (Node.js)** | Filesystem (`data/`) | Free | Yes | N/A |
| **Docker** | Filesystem (volume) | Free | Yes | N/A |
| **Vercel + Upstash Redis** | Redis (auto-TTL) | Free | No (serverless) | ~250ms |

---

## Architecture: Dual Storage

The app uses a storage abstraction (`lib/storage.js`) that auto-selects the backend:

```
UPSTASH_REDIS_REST_URL is set?
  ├── Yes → RedisStorage  (Upstash Redis, serverless-friendly)
  └── No  → FileStorage   (local data/ directory)
```

Both implement the same interface. Redis uses native key TTL for auto-expiry; FileStorage uses an hourly cleanup sweep. No code changes are needed to switch -- just set or unset the environment variable.

---

## Option 1: Local Development

```bash
cp .env.example .env    # edit if needed
npm install
node server.js
```

Opens on `http://localhost:8001`. Diagrams are stored in `data/` on disk.

For PlantUML rendering, Kroki must be running separately:

```bash
bash scripts/start_kroki.sh
```

The Mermaid editor (`/mermaid`) works without Kroki.

---

## Option 2: Docker

```bash
cp .env.example .env
bash deploy.sh
```

Or manually with Docker Compose:

```bash
docker compose up -d --build
```

Diagram storage uses a named Docker volume (`editor-data`), so data persists across container restarts.

---

## Option 3: Vercel + Upstash Redis (Free Tier)

### What you get

- **Vercel Hobby** (free): global CDN, serverless functions, HTTPS, custom domains
  - 100 GB bandwidth/month, 100K function invocations/day
- **Upstash Redis** (free): managed Redis with REST API
  - 10K commands/day, 256 MB storage, no credit card required
- Diagrams auto-expire via Redis TTL -- no cleanup job needed

### Prerequisites

- A [GitHub](https://github.com) account (Vercel deploys from Git)
- A [Vercel](https://vercel.com) account (sign up with GitHub -- free, no credit card)
- An [Upstash](https://upstash.com) account (free, no credit card)

### Step 1: Create Upstash Redis Database

1. Go to [console.upstash.com](https://console.upstash.com)
2. Click **Create Database**
3. Pick a name (e.g. `seq-diag-editor`) and the region closest to your Vercel deployment
4. Select the **Free** plan
5. Once created, go to the database details page and copy:
   - **UPSTASH_REDIS_REST_URL** (looks like `https://xxx.upstash.io`)
   - **UPSTASH_REDIS_REST_TOKEN** (long string)

### Step 2: Push to GitHub

If not already a Git repo:

```bash
git init
git add .
git commit -m "Initial commit"
```

Create a repository on GitHub and push:

```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy to Vercel

**Option A: Via Vercel Dashboard (recommended)**

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Vercel auto-detects the project -- no build settings needed
4. Before clicking **Deploy**, go to **Environment Variables** and add:

   | Name | Value |
   |------|-------|
   | `UPSTASH_REDIS_REST_URL` | *(paste from Upstash)* |
   | `UPSTASH_REDIS_REST_TOKEN` | *(paste from Upstash)* |
   | `SHARE_TTL_DAYS` | `5` (or your preferred TTL) |

5. Click **Deploy**

**Option B: Via CLI**

```bash
npm i -g vercel
vercel                  # follow prompts to link project
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel env add SHARE_TTL_DAYS
vercel --prod           # deploy to production
```

### Step 4: Verify

Once deployed, Vercel gives you a URL like `https://your-project.vercel.app`. Test:

| URL | Expected |
|-----|----------|
| `https://your-project.vercel.app/` | PlantUML editor loads |
| `https://your-project.vercel.app/mermaid` | Mermaid editor loads |
| Share a diagram | Creates a short link that resolves correctly |

### How It Works on Vercel

```
Request
  │
  ├── Static file? (e.g. /puml.html, /mermaid.html)
  │     └── Served directly from Vercel CDN (public/ directory)
  │
  ├── /  → rewritten to /puml.html (vercel.json)
  ├── /mermaid → rewritten to /mermaid.html (vercel.json)
  │
  └── /api/* → routed to api/index.js (serverless function)
        └── Express app with share routes
              └── RedisStorage (Upstash)
```

Key files for Vercel:

| File | Purpose |
|------|---------|
| `vercel.json` | URL rewrites for clean routes and API routing |
| `api/index.js` | Serverless function entry point (Express + API routes) |
| `lib/storage.js` | Auto-selects RedisStorage when `UPSTASH_REDIS_REST_URL` is set |
| `lib/api-routes.js` | Shared Express Router (used by both `server.js` and `api/index.js`) |
| `public/` | Static files served by Vercel CDN |

### Subsequent Deploys

Push to `main` and Vercel redeploys automatically:

```bash
git add .
git commit -m "Update"
git push
```

---

## Environment Variables Reference

| Variable | Default | Used By | Description |
|----------|---------|---------|-------------|
| `PORT` | `8001` | Local/Docker | Server listen port |
| `SHARE_TTL_DAYS` | `5` | All | Auto-delete diagrams older than N days (0 = disabled) |
| `SHARE_MAX_FILES` | `100` | Local/Docker | Max stored diagram files (0 = unlimited) |
| `SHARE_MAX_SIZE_MB` | `20` | Local/Docker | Max total file storage in MB (0 = unlimited) |
| `UPSTASH_REDIS_REST_URL` | *(blank)* | Vercel | Upstash Redis REST URL (enables Redis storage) |
| `UPSTASH_REDIS_REST_TOKEN` | *(blank)* | Vercel | Upstash Redis auth token |
| `CONTAINER_NAME` | `seq-diag-editor` | Docker | Docker container name |
| `IMAGE_NAME` | `seq-diag-editor` | Docker | Docker image name |
| `KROKI_PORT` | `8000` | Local/Docker | Kroki container port |
| `HTTP_PROXY` | *(blank)* | Docker build | HTTP proxy for corporate networks |
| `HTTPS_PROXY` | *(blank)* | Docker build | HTTPS proxy |
| `NO_PROXY` | `localhost,127.0.0.1` | Docker build | Proxy bypass list |

---

## Free Tier Limits

### Vercel Hobby

- 100 GB bandwidth/month
- 100K serverless function invocations/day
- 10-second function execution timeout
- Automatic HTTPS
- 1 concurrent build

### Upstash Redis Free

- 10,000 commands/day
- 256 MB max storage
- 1 database
- No credit card required

For a diagram editor with occasional sharing, these limits are well above typical usage. Each share operation = 1 Redis write; each view = 1 Redis read. With TTL-based auto-expiry, storage stays bounded automatically.

---

## Troubleshooting

**Share API returns 500 on Vercel**
- Check that `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set correctly in Vercel Environment Variables (Settings > Environment Variables).
- Verify the Upstash database is active at [console.upstash.com](https://console.upstash.com).

**PlantUML diagrams don't render on Vercel**
- PlantUML rendering requires a Kroki server. By default the editor points to `http://localhost:8000`. On Vercel, change the Kroki URL in the editor's **Settings** to use the public Kroki instance: `https://kroki.io`.

**Mermaid editor works but PlantUML doesn't**
- The Mermaid editor renders client-side and has no server dependency. PlantUML needs Kroki -- see above.

**Local server shows `[storage] Using Upstash Redis` unexpectedly**
- You have `UPSTASH_REDIS_REST_URL` set in your local `.env`. Remove or blank it to use filesystem storage locally.
