# Phase 2: BYOK Hosted Web App — Requirements & Architecture

**Status:** Draft for review  
**Author:** Kiro (AI) — pending approval from Gowthamvel + Kimi AI review  
**Date:** 2026-07-10

---

## 1. Product Vision

A hosted web app where users paste their own API keys and use the job-search-bot via browser. Zero API cost to the platform owner. Revenue comes from premium features (Phase 3+).

**One-liner:** "AI job search that scores roles against your resume — runs in your browser, uses your keys, costs you cents."

---

## 2. Target User

| Persona | Description | Setup willingness |
|---------|-------------|-------------------|
| **Technical job seeker** | Developer/engineer who understands API keys | High — already has Gemini/Apify keys |
| **Semi-technical** | PM, analyst, data scientist who can follow instructions | Medium — will paste keys if guided |
| **Non-technical** | Designer, marketer, career changer | Low — needs managed tier (Phase 4) |

**Phase 2 targets personas 1 and 2 only.** Persona 3 waits for Phase 4 (managed tier).

---

## 3. Core Requirements

### 3.1 Must-Have (MVP)

| # | Feature | Why |
|---|---------|-----|
| 1 | User auth (email/password + Google OAuth) | Multi-tenancy |
| 2 | BYOK onboarding — paste Gemini + Apify keys | Core value prop |
| 3 | Key validation on save (test each key) | Confidence before first run |
| 4 | Job search — trigger `search_jobs` from browser | Primary use case |
| 5 | Job scoring — trigger `score_job` from browser | Primary use case |
| 6 | Results list with score, company, source, posted date | Usability |
| 7 | Resume upload (paste or file) + bootstrap | Onboarding |
| 8 | Per-user isolation (each user has own DB, profile, results) | Security |

### 3.2 Should-Have (post-MVP, same sprint)

| # | Feature | Why |
|---|---------|-----|
| 9 | Cover letter generation | High-value action |
| 10 | Bookmarks (save/unsave jobs) | Retention |
| 11 | Email digest opt-in (runs on schedule) | Passive value |
| 12 | Basic analytics (jobs scored, strong matches, avg score) | Engagement |

### 3.3 Won't-Have (explicitly deferred)

| Feature | Reason |
|---------|--------|
| Plugin marketplace | Phase 3 |
| Managed tier (no keys needed) | Phase 4 |
| Auto-apply | Never — core design principle |
| Interview tracking / reminders | Nice-to-have, not MVP |
| Payment / billing | Not needed until Phase 3 |

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                             │
│  Next.js App (Vercel)                                           │
│  ├── /login, /signup        ← Auth (Clerk or NextAuth)          │
│  ├── /onboarding            ← Paste keys, upload resume         │
│  ├── /dashboard             ← Job results, bookmarks            │
│  ├── /discover              ← Search form → results             │
│  └── /settings              ← Keys, profile, preferences        │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS (JSON)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI on Railway)                  │
│                                                                   │
│  ├── /api/auth/*            ← Verify JWT from Clerk/NextAuth     │
│  ├── /api/keys              ← CRUD encrypted keys                │
│  ├── /api/search            ← Calls bot search with user's keys  │
│  ├── /api/score             ← Calls bot score with user's keys   │
│  ├── /api/cover-letter      ← Calls bot generate_materials       │
│  ├── /api/analytics         ← Reads user's job DB                │
│  └── /api/bootstrap         ← Runs bootstrap with user's resume  │
│                                                                   │
│  Per-request: decrypt user keys → inject into bot config →        │
│               execute bot function → return result                │
│                                                                   │
│  User data: PostgreSQL (Supabase)                                │
│  ├── users (id, email, created_at)                               │
│  ├── api_keys (user_id, service, encrypted_key)                  │
│  ├── profiles (user_id, anchor_skill, primary_skills, ...)       │
│  ├── jobs (user_id, job_id, title, score, ...)                   │
│  └── bookmarks (user_id, job_id, saved_at)                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BOT FUNCTIONS (imported directly)             │
│  bot/discovery.py, bot/main.py, bot/db.py, bot/config.py        │
│  (NOT modified — called with injected per-user config)           │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend framework | Next.js 14 (App Router) | SSR, Vercel deployment, ecosystem |
| Backend framework | FastAPI (Python) | Same language as bot, async, fast |
| Auth | Clerk | Hosted auth, minimal code, free tier (10k MAU) |
| Database | Supabase (PostgreSQL) | Free tier generous, auth integration, real-time option |
| Key encryption | AES-256-GCM, key from env var | Industry standard, decrypt only at request time |
| Bot integration | Direct Python import (not MCP HTTP) | Simpler, faster, same process — no network hop |
| Deployment | Vercel (frontend) + Railway (backend) | Free/cheap tiers, easy CI/CD |
| Per-user isolation | PostgreSQL row-level, user_id on every table | Standard multi-tenant pattern |

---

## 5. Multi-Tenancy Approach

**The problem:** The bot currently uses module-level globals (`config.py` loaded at import time). Can't serve multiple users from one process with different configs.

**The solution:** A thin adapter layer that:

1. Receives a request with user's JWT
2. Looks up user's encrypted keys from DB
3. Decrypts keys
4. Creates a **per-request context** with user's config (keys, profile, resume)
5. Calls bot functions with that context injected
6. Returns results

```python
# Pseudocode — NOT actual implementation
async def handle_search_request(user_id: str, params: dict):
    # 1. Load user's config from DB
    user_keys = decrypt_keys(db.get_keys(user_id))
    user_profile = db.get_profile(user_id)
    
    # 2. Create isolated config context
    ctx = BotContext(
        gemini_key=user_keys["gemini"],
        apify_key=user_keys["apify"],
        profile=user_profile,
    )
    
    # 3. Execute bot function with context
    results = await run_in_context(ctx, discovery.fetch_new_postings)
    
    # 4. Save results to user's partition
    db.save_jobs(user_id, results)
    
    return results
```

**The tricky part:** The bot functions read from `config.APIFY_API_KEY` (module globals). We need a context injection mechanism. Options:

| Option | Pros | Cons |
|--------|------|------|
| **A. Thread-local / contextvars** | No bot changes, inject at runtime | Complex, potential leaks between async tasks |
| **B. Fork bot into multi-tenant version** | Clean, proper | Violates "don't modify bot/" constraint |
| **C. Subprocess per request** | True isolation | Slow (500ms+ per request), resource-heavy |
| **D. Monkey-patch config per request** | Simple, fast | Not thread-safe, race conditions in async |
| **E. Process pool with pre-loaded configs** | Fast after warmup | Memory-heavy, limited concurrency |

**Recommended: Option A (contextvars)** with a thin wrapper module that doesn't modify `bot/` files but intercepts config reads at the boundary. The bot code stays untouched; the backend wraps each call with a context manager that temporarily sets the right config values for that request.

---

## 6. Database Schema

```sql
-- Users (managed by Clerk, mirrored for FK relationships)
CREATE TABLE users (
    id          TEXT PRIMARY KEY,  -- Clerk user ID
    email       TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Encrypted API keys
CREATE TABLE api_keys (
    id          SERIAL PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    service     TEXT NOT NULL,  -- 'gemini', 'apify', 'gmail'
    encrypted_key BYTEA NOT NULL,
    validated   BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, service)
);

-- User profiles (from bootstrap)
CREATE TABLE profiles (
    user_id         TEXT PRIMARY KEY REFERENCES users(id),
    anchor_skill    TEXT,
    primary_skills  JSONB DEFAULT '[]',
    search_terms    JSONB DEFAULT '[]',
    keywords        JSONB DEFAULT '[]',
    location        TEXT,
    country         TEXT,
    seniority       TEXT,
    summary         TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Scored jobs (per user)
CREATE TABLE jobs (
    id              SERIAL PRIMARY KEY,
    user_id         TEXT REFERENCES users(id),
    job_id          TEXT NOT NULL,
    title           TEXT,
    company         TEXT,
    location        TEXT,
    url             TEXT,
    score           INTEGER,
    skill_bonus     INTEGER DEFAULT 0,
    status          TEXT,
    reasoning       TEXT,
    materials       TEXT,
    posted_date     TEXT,
    is_remote       BOOLEAN DEFAULT FALSE,
    visa_sponsorship BOOLEAN DEFAULT FALSE,
    source          TEXT,
    seen_at         TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, job_id)
);

-- Bookmarks
CREATE TABLE bookmarks (
    user_id     TEXT REFERENCES users(id),
    job_id      TEXT NOT NULL,
    notes       TEXT DEFAULT '',
    saved_at    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, job_id)
);

-- Resumes (stored as text, not files)
CREATE TABLE resumes (
    user_id     TEXT PRIMARY KEY REFERENCES users(id),
    content     TEXT NOT NULL,
    filename    TEXT,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/keys` | ✅ | Save/update encrypted API keys |
| GET | `/api/keys/status` | ✅ | Check which keys are set + validated |
| POST | `/api/keys/validate` | ✅ | Test a key against its service |
| POST | `/api/resume` | ✅ | Upload resume text |
| POST | `/api/bootstrap` | ✅ | Run bootstrap (extract profile from resume) |
| GET | `/api/profile` | ✅ | Get user's profile (anchor_skill, skills, etc.) |
| PUT | `/api/profile` | ✅ | Update profile fields |
| POST | `/api/search` | ✅ | Run job search with user's keys |
| POST | `/api/score` | ✅ | Score a single job |
| POST | `/api/cover-letter` | ✅ | Generate cover letter for a job |
| GET | `/api/jobs` | ✅ | Get user's scored jobs (filters: score, source, date) |
| POST | `/api/bookmarks` | ✅ | Save a job to bookmarks |
| DELETE | `/api/bookmarks/:job_id` | ✅ | Remove bookmark |
| GET | `/api/analytics` | ✅ | Get scoring stats |
| GET | `/api/health` | — | Public health check (no user data) |

---

## 8. Pages / UI Flow

```
/login          → Clerk auth (email/password or Google)
    ↓
/onboarding     → Step 1: Paste resume
                  Step 2: Paste API keys (Gemini required, Apify required)
                  Step 3: Run bootstrap → show extracted profile
                  Step 4: "Start searching" button
    ↓
/dashboard      → Job list (scored, bookmarked)
                  Filters: score range, source, remote, date
                  Actions: score, cover letter, bookmark
    ↓
/discover       → Search form: role, location, remote toggle, posted_within_days
                  Results: ranked list with scores
                  One-click: score, bookmark, generate materials
    ↓
/settings       → Keys tab: show status (set/missing), re-validate, update
                  Profile tab: anchor skill, skills, search terms (editable)
                  Account tab: email, delete account
```

---

## 9. Security

| Concern | Mitigation |
|---------|-----------|
| API keys at rest | AES-256-GCM encryption, encryption key from env var (not in DB) |
| API keys in transit | HTTPS only, keys never returned in API responses (only "set"/"missing") |
| User isolation | All DB queries include `user_id` WHERE clause, no cross-user access |
| Rate limiting | 100 requests/hour per user (prevent abuse of Gemini/Apify via your server) |
| CORS | Only allow requests from your frontend domain |
| Auth | JWT verification on every API call, short-lived tokens |
| Resume data | Stored encrypted, deleted on account deletion |

---

## 10. Deployment

| Component | Platform | Cost (initial) |
|-----------|----------|---------------|
| Frontend (Next.js) | Vercel | Free (hobby tier) |
| Backend (FastAPI) | Railway | Free ($5/mo after trial) |
| Database (PostgreSQL) | Supabase | Free (500MB, 50k rows) |
| Auth | Clerk | Free (10k MAU) |
| Domain | Namecheap/Cloudflare | ~$12/year |

**Total initial cost: ~$5–17/month** (mostly domain + Railway after free trial)

---

## 11. Build Order (2-week sprint)

| Day | What | Deliverable |
|-----|------|-------------|
| 1–2 | Backend skeleton: FastAPI + Supabase + Clerk JWT verification | `/api/health` returns 200 |
| 3 | Key management: encrypt/decrypt/validate endpoints | User can save and validate keys |
| 4 | Resume + bootstrap: upload resume → run bootstrap → save profile | Profile extracted from resume |
| 5–6 | Search + score: wire up bot functions with per-user context | User can search and score jobs |
| 7 | Frontend: auth pages + onboarding flow | User can sign up and paste keys |
| 8–9 | Frontend: discover page + results list | User can search and see scored results |
| 10 | Frontend: dashboard + bookmarks | User can manage their results |
| 11 | Cover letter generation + analytics page | Full feature set |
| 12–13 | Polish: error handling, loading states, mobile responsive | Production quality |
| 14 | Deploy: Vercel + Railway + Supabase + domain | Live at URL |

---

## 12. Tech Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router) | 14.x |
| UI components | shadcn/ui + Tailwind CSS | Latest |
| Auth | Clerk | Latest |
| Backend | FastAPI | 0.110+ |
| Database | PostgreSQL (Supabase) | 15 |
| ORM | SQLAlchemy (async) | 2.x |
| Key encryption | `cryptography` (Fernet / AES-GCM) | Latest |
| Bot integration | Direct import from `bot/` | — |
| Deployment | Vercel + Railway | — |

---

## 13. Open Questions (for your review)

| # | Question | Options | My lean |
|---|----------|---------|---------|
| 1 | **Auth provider:** Clerk vs NextAuth? | Clerk (hosted, simple) vs NextAuth (self-hosted, more control) | Clerk — less code, free tier is generous |
| 2 | **Bot isolation:** contextvars vs subprocess? | contextvars (fast, complex) vs subprocess (slow, safe) | contextvars — acceptable for BYOK where user trusts the platform |
| 3 | **Scheduled runs:** should the web app run the bot hourly for each user? | Yes (like CI does now) vs No (on-demand only) | Start with on-demand only. Add scheduled runs later if users ask. |
| 4 | **Domain name:** what URL? | jobagent.app, jobscoreai.com, hirehybrid.app, etc. | Your call |
| 5 | **Mobile:** responsive web only, or native app later? | Responsive web | Responsive web — no native app |
| 6 | **Free tier limits:** what's free vs paid? | Unlimited search + score (free), cover letter + analytics (paid) | Everything free for now. Add paywall only after proving retention. |

---

## 14. Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| No one signs up | Wasted 2 weeks of build time | Acceptable — portfolio value remains |
| Bot functions don't work in multi-tenant context | Architecture doesn't scale | Prototype the contextvars approach in day 1–2 before building UI |
| Apify costs surprise users | User churn | Show cost estimator in UI + hard cap per search |
| Supabase free tier runs out | Need to pay or migrate | 500MB / 50k rows is plenty for 100 users |
| Clerk free tier runs out (10k MAU) | Need to pay | Unlikely to hit 10k users in validation phase |

---

## Next Steps

1. **You review this spec** — flag anything that feels wrong or missing
2. **Share with Kimi AI** — get a second opinion on architecture choices
3. **Decide open questions** (auth, domain, free tier policy)
4. **Once approved** — I start implementation, day by day per the build order
