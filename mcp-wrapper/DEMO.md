# MCP Server Demo Script

A 60-second walkthrough demonstrating the job-search-bot MCP server in action.

---

## Prerequisites

- MCP server configured in your AI client (Kiro, Claude Desktop, or Cursor)
- Bot configured with API keys (run `run_health_check()` first to verify)
- Some scored jobs in the database (run the pipeline at least once)

---

## Script (60 seconds)

### 0:00 — Open your AI agent with MCP configured

Open Claude Desktop, Kiro, or Cursor with the job-search MCP server connected.

### 0:05 — Search for jobs

> "Search for jobs posted in the last 3 days"

**Expected:** Agent calls `search_jobs(posted_within_days=3)`, returns list of matching jobs with titles, companies, locations, and sources.

### 0:15 — Score a specific job

> "Score the Senior Rails Engineer role at Stripe — here's the description: [paste job description]"

**Expected:** Agent calls `score_job(...)`, returns:
- Final score (Gemini + skill bonus)
- Reasoning explaining the fit
- Whether it's a strong match

### 0:30 — Generate a cover letter

> "Generate a cover letter for that role"

**Expected:** Agent calls `generate_cover_letter(...)`, returns tailored resume bullets and a personalised cover letter.

### 0:40 — Check analytics

> "How many strong matches did I get this week?"

**Expected:** Agent calls `get_analytics(hours=168)`, returns total scored, strong matches, average score, breakdown by source.

### 0:50 — Bookmark and set reminder

> "Bookmark the Stripe job and remind me to follow up in 3 days"

**Expected:** Agent calls `save_job(job_id=...)` then `set_reminder(message="Follow up with Stripe", due_at="...")`.

### 0:55 — Health check

> "Is the bot healthy?"

**Expected:** Agent calls `run_health_check()`, returns all-green status for API keys, resume, profile, database.

---

## Key points to highlight

1. **No terminal needed** — everything happens in natural language
2. **Instant responses** — no waiting for the hourly cron
3. **Same bot, new interface** — the pipeline code is completely untouched
4. **Local-only** — data never leaves your machine (stdio transport)
5. **25 tools** — search, score, generate materials, track interviews, set reminders, export data

---

## Recording tips

- Use a clean session (no prior messages)
- Have a real job posting URL ready to paste
- Show the tool calls in the agent's debug/verbose mode if available
- End with the analytics view to show the bot has been working in the background
