# MCP Wrapper for job-search-bot

A [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes the job-search-bot pipeline as tools for AI agents (Claude, Kiro, Cursor, etc.).

> **Note:** If this wrapper matures into a standalone project, it will be moved to its own repository.

---

## Setup

### Prerequisites

- Python 3.11+
- The bot configured and working (see [root README](../README.md))
- API keys set in `.env` at the project root

### Install

```bash
pip install -e "./mcp-wrapper"
```

### Configure in your MCP client

**Kiro / VS Code** (`.kiro/settings/mcp.json`):

```json
{
  "mcpServers": {
    "job-search": {
      "command": "python",
      "args": ["mcp-wrapper/server.py"],
      "cwd": "/path/to/job-search-bot"
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "job-search": {
      "command": "python",
      "args": ["/path/to/job-search-bot/mcp-wrapper/server.py"],
      "env": {
        "GEMINI_API_KEY": "your-key",
        "APIFY_API_KEY": "your-key",
        "GMAIL_ADDRESS": "your@gmail.com",
        "GMAIL_APP_PASSWORD": "your-app-password"
      }
    }
  }
}
```

---

## Architecture

```
AI Agent (Claude / Kiro / Cursor)
    │
    ▼ MCP Protocol (stdio)
┌──────────────────────────────┐
│  mcp-wrapper/                │
│  server.py  → 25 tools       │
│  tools.py   → handlers       │
│  storage.py → wrapper.db     │
└──────────────────────────────┘
    │                    │
    ▼                    ▼
┌────────────┐    ┌────────────┐
│  bot/      │    │ wrapper.db │
│  jobs.db   │    │ bookmarks  │
│  main.py   │    │ interviews │
│  config.py │    │ reminders  │
└────────────┘    └────────────┘
```

---

## Tool Reference

### Tier 1 — Live (wraps existing bot functions)

| Tool | Description | Status |
|------|-------------|--------|
| `search_jobs` | Fetch and filter jobs from Apify (LinkedIn, Indeed, Glassdoor, Naukri) + Greenhouse/Lever | ✅ Live |
| `score_job` | Score a single job using hybrid scoring (Gemini AI + skill bonus) | ✅ Live |
| `run_pipeline` | Execute full pipeline: fetch → score → email CSV digest | ✅ Live |
| `flush_db` | Reset database for fresh scoring | ✅ Live |
| `bootstrap` | Regenerate profile.json from resume.txt | ✅ Live |
| `generate_cover_letter` | Generate tailored resume bullets + cover letter for a specific job | ✅ Live |
| `get_platforms` | Show configured job boards, search terms, and company slugs | ✅ Live |
| `get_analytics` | Scoring analytics: totals, averages, breakdown by source | ✅ Live |
| `get_saved_jobs` | Retrieve previously scored jobs filtered by time and score | ✅ Live |
| `run_health_check` | Validate API keys, files, DB connectivity | ✅ Live |

### Tier 2 — Live (wrapper-local storage)

| Tool | Description | Status |
|------|-------------|--------|
| `save_job` | Bookmark a job for later reference | ✅ Live |
| `unsave_job` | Remove a job from bookmarks | ✅ Live |
| `get_job_details` | Get full details of a scored job by ID or URL | ✅ Live |
| `update_profile` | Update a field in profile.json (takes effect on next run) | ✅ Live |
| `export_data` | Export all scored jobs as JSON or CSV | ✅ Live |

### Tier 3 — Implemented (wrapper-local storage)

| Tool | Description | Status |
|------|-------------|--------|
| `add_interview` | Track an upcoming interview | ✅ Live |
| `get_upcoming_interviews` | List upcoming interviews | ✅ Live |
| `set_reminder` | Set a follow-up reminder | ✅ Live |
| `get_reminders` | Get active reminders | ✅ Live |
| `dismiss_reminder` | Mark a reminder as done | ✅ Live |
| `get_bot_status` | Get last run time and configuration | ✅ Partial |
| `compare_jobs` | Compare jobs side by side | 🔜 Stub |
| `get_company_info` | Company enrichment data | 🔜 Stub |
| `pause_bot` | Pause the hourly cron | 🔜 Stub |
| `resume_bot` | Resume the hourly cron | 🔜 Stub |

### Skipped (contradicts bot design)

| Tool | Reason |
|------|--------|
| `apply_to_job` / `batch_apply` | Bot never auto-applies — core design principle |
| `withdraw_application` | No application tracking |
| `upload_resume` | Resume is a local file, managed outside chat |
| `tailor_resume` | Duplicates `generate_cover_letter` |
| `generate_counter_offer` / `get_market_rate` | No data source |
| `log_offer` / `compare_offers` | Out of scope |
| `set_rate_limit` | Config is static by design |

---

## Usage Examples

Once connected, ask your AI agent:

```
"Search for Rails jobs posted in the last 3 days"
→ calls search_jobs(posted_within_days=3)

"Score this job posting: Senior Rails Engineer at Stripe..."
→ calls score_job(title, company, url, text)

"Run the full pipeline now"
→ calls run_pipeline()

"Generate a cover letter for the Stripe role"
→ calls generate_cover_letter(title, company, text)

"How many jobs have I scored this week?"
→ calls get_analytics(hours=168)

"Bookmark that 95-score job from yesterday"
→ calls save_job(job_id="ap_linkedin_...")

"Show me all jobs scored above 80"
→ calls get_saved_jobs(min_score=80)

"I have an interview with Stripe next Tuesday at 3pm"
→ calls add_interview(company="Stripe", datetime="2026-07-15T15:00")

"Remind me to follow up with Stripe in 3 days"
→ calls set_reminder(message="Follow up with Stripe", due_at="2026-07-10")

"Is the bot healthy?"
→ calls run_health_check()

"Change my anchor skill to Python"
→ calls update_profile(key="anchor_skill", value="Python")

"Export all my scored jobs as CSV"
→ calls export_data(format="csv")
```

---

## Storage

The wrapper uses two databases:

| Database | Owner | Contents |
|----------|-------|----------|
| `bot/jobs.db` | Bot (read by wrapper) | Scored jobs, meta timestamps |
| `mcp-wrapper/wrapper.db` | Wrapper only | Bookmarks, interviews, reminders |

`wrapper.db` is gitignored and created automatically on first use.

---

## Future extraction

If this wrapper matures into a standalone project with its own release cadence or user base, it will be extracted to a separate repository. The `bot/` package will become a pip-installable dependency referenced via git URL or PyPI.
