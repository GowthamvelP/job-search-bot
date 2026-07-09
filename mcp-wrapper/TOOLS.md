# MCP Tool Reference

Complete reference for all 25 tools exposed by the job-search-bot MCP wrapper.

---

## Tier 1 — Live (wraps existing bot functions)

### search_jobs

| | |
|---|---|
| **Tier** | 1 — Live |
| **Status** | ✅ Live |
| **Description** | Fetch and filter job postings from all configured sources (Apify: LinkedIn, Indeed, Glassdoor, Naukri + Greenhouse/Lever). Returns filtered, sorted jobs. Does NOT score them. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `posted_within_days` | integer | No | 7 | Clamped to 1–90 |

**Return schema:**

```json
{
  "total_fetched": 142,
  "returned": 50,
  "jobs": [
    {
      "id": "ap_linkedin_abc123",
      "title": "Senior Rails Engineer",
      "company": "Stripe",
      "location": "Bangalore, India",
      "url": "https://linkedin.com/jobs/view/...",
      "posted_date": "2025-07-05",
      "is_remote": true,
      "visa_sponsorship": false,
      "source": "linkedin"
    }
  ]
}
```

**Error cases:**
- API key missing → Apify/JSearch sources silently skipped, returns only Greenhouse/Lever results
- Network timeout → partial results from sources that responded

**Example conversation:**

```
User: "Search for jobs posted in the last 3 days"
Agent: calls search_jobs(posted_within_days=3)
```

---

### score_job

| | |
|---|---|
| **Tier** | 1 — Live |
| **Status** | ✅ Live |
| **Description** | Score a single job posting against your resume using hybrid scoring (Gemini AI 0-100 + skill-alignment bonus 0-30 = final score capped at 100). |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `title` | string | Yes | — | Must be non-empty |
| `company` | string | Yes | — | Must be non-empty |
| `location` | string | No | `""` | — |
| `url` | string | Yes | — | Must be non-empty |
| `text` | string | Yes | — | Must be non-empty (full job description) |
| `is_remote` | boolean | No | `false` | — |

**Return schema:**

```json
{
  "final_score": 87,
  "gemini_score": 72,
  "skill_bonus": 15,
  "reasoning": "Strong match: Rails expertise aligns with core requirement. 5+ years experience matches seniority. Location compatible.",
  "is_strong_match": true
}
```

**Error cases:**
- Required field empty → `{"error": "'title' is required and must be a non-empty string."}`
- Gemini quota exhausted → `{"error": "All Gemini model quotas exhausted. Try after midnight Pacific.", "skill_bonus": 15}`

**Example conversation:**

```
User: "Score this Senior Rails Engineer role at Stripe"
Agent: calls score_job(title="Senior Rails Engineer", company="Stripe", url="https://...", text="We're looking for...")
```

---

### run_pipeline

| | |
|---|---|
| **Tier** | 1 — Live |
| **Status** | ✅ Live |
| **Description** | Execute the full job search pipeline: fetch → filter → hybrid score → generate materials for strong matches → email CSV digest. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `flush` | boolean | No | `false` | Reset DB before running |

**Return schema:**

```json
{
  "status": "completed",
  "output": "Fetched 85 jobs...\nScored 23 new jobs...\nStrong matches: 4\nEmail sent."
}
```

**Error cases:**
- Pipeline error → `{"status": "error", "message": "...", "partial_output": "..."}`

**Example conversation:**

```
User: "Run the full pipeline now"
Agent: calls run_pipeline()
```

---

### flush_db

| | |
|---|---|
| **Tier** | 1 — Live |
| **Status** | ✅ Live |
| **Description** | Reset the jobs database. Deletes all scored jobs and rate-limit timestamps. Next run starts fresh. |

**Parameters:** None

**Return schema:**

```json
{
  "status": "flushed",
  "message": "Database reset. Next run will re-fetch and re-score everything."
}
```

**Error cases:** None expected (DB is always writable locally).

**Example conversation:**

```
User: "Reset everything and start fresh"
Agent: calls flush_db()
```

---

### bootstrap

| | |
|---|---|
| **Tier** | 1 — Live |
| **Status** | ✅ Live |
| **Description** | Regenerate profile.json from resume.txt using Gemini AI. Extracts anchor_skill, primary_skills, search_terms, keywords, location, seniority. |

**Parameters:** None

**Return schema:**

```json
{
  "status": "completed",
  "output": "Extracted profile from resume.txt\nAnchor skill: Ruby on Rails\nWritten to profile.json"
}
```

**Error cases:**
- resume.txt missing → error in output
- Gemini quota exhausted → error message

**Example conversation:**

```
User: "I updated my resume, regenerate my profile"
Agent: calls bootstrap()
```

---

### generate_cover_letter

| | |
|---|---|
| **Tier** | 1 — Live |
| **Status** | ✅ Live |
| **Description** | Generate tailored resume bullets and a cover letter for a specific job posting. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `title` | string | Yes | — | Must be non-empty |
| `company` | string | Yes | — | Must be non-empty |
| `location` | string | No | `""` | — |
| `url` | string | No | `""` | — |
| `text` | string | Yes | — | Must be non-empty (full job description) |

**Return schema:**

```json
{
  "status": "completed",
  "materials": "## Tailored Resume Bullets\n- Led migration of...\n\n## Cover Letter\nDear Hiring Manager,\n..."
}
```

**Error cases:**
- Required field empty → `{"error": "'title' is required and must be a non-empty string."}`
- Gemini quota → `{"status": "error", "message": "Gemini quota exhausted. Try after midnight Pacific."}`

**Example conversation:**

```
User: "Write a cover letter for the Stripe role"
Agent: calls generate_cover_letter(title="Senior Rails Engineer", company="Stripe", text="...")
```

---

### get_platforms

| | |
|---|---|
| **Tier** | 1 — Live |
| **Status** | ✅ Live |
| **Description** | Show configured job boards, search terms, and company slugs. |

**Parameters:** None

**Return schema:**

```json
{
  "apify_boards": ["linkedin", "indeed", "glassdoor", "naukri"],
  "apify_search_terms": ["ruby on rails", "backend engineer"],
  "greenhouse_companies": ["stripe", "figma"],
  "lever_companies": ["netlify"],
  "jsearch_enabled": false,
  "anchor_skill": "Ruby on Rails",
  "posted_within_days": 7
}
```

**Error cases:** None.

**Example conversation:**

```
User: "What job boards am I searching?"
Agent: calls get_platforms()
```

---

### get_analytics

| | |
|---|---|
| **Tier** | 1 — Live |
| **Status** | ✅ Live |
| **Description** | Get scoring analytics: total jobs, strong matches, average score, breakdown by source. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `hours` | integer | No | 168 (7 days) | Clamped to 1–8760 |

**Return schema:**

```json
{
  "total_jobs_scored": 342,
  "strong_matches": 28,
  "below_threshold": 290,
  "score_errors": 24,
  "average_score": 52.3,
  "jobs_last_period": 45,
  "period_hours": 168,
  "by_source": [
    {"source": "linkedin", "count": 150, "avg_score": 55.2},
    {"source": "indeed", "count": 89, "avg_score": 48.1}
  ]
}
```

**Error cases:** None expected (returns zeros if DB is empty).

**Example conversation:**

```
User: "How many jobs have I scored this week?"
Agent: calls get_analytics(hours=168)
```

---

### get_saved_jobs

| | |
|---|---|
| **Tier** | 1 — Live |
| **Status** | ✅ Live |
| **Description** | Retrieve previously scored jobs from the database. Filter by recency and minimum score. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `hours` | integer | No | 24 | Clamped to 1–8760 |
| `min_score` | integer | No | 0 | Clamped to 0–100 |

**Return schema:**

```json
{
  "count": 5,
  "jobs": [
    {
      "job_id": "ap_linkedin_abc123",
      "title": "Senior Rails Engineer",
      "company": "Stripe",
      "location": "Remote",
      "url": "https://...",
      "score": 92,
      "status": "strong_match",
      "reasoning": "Excellent fit...",
      "posted_date": "2025-07-05",
      "is_remote": 1,
      "visa_sponsorship": 0,
      "source": "linkedin"
    }
  ]
}
```

**Error cases:** None expected (returns empty list if no matches).

**Example conversation:**

```
User: "Show me all jobs scored above 80"
Agent: calls get_saved_jobs(min_score=80)
```

---

### run_health_check

| | |
|---|---|
| **Tier** | 1 — Live |
| **Status** | ✅ Live |
| **Description** | Validate bot configuration: API keys, resume file, profile, database connectivity. Never exposes actual credential values. |

**Parameters:** None

**Return schema:**

```json
{
  "gemini_api_key": "set",
  "apify_api_key": "set",
  "gmail_address": "set",
  "gmail_app_password": "set",
  "resume_file": "exists",
  "profile_json": "loaded",
  "anchor_skill": "Ruby on Rails",
  "database": "writable",
  "overall": "healthy"
}
```

**Error cases:**
- Missing key → value shows `"MISSING"`
- DB error → value shows `"ERROR: ..."`
- Overall → `"issues_detected"` if any check fails

**Example conversation:**

```
User: "Is the bot healthy?"
Agent: calls run_health_check()
```

---

## Tier 2 — Live (wrapper-local storage)

### save_job

| | |
|---|---|
| **Tier** | 2 — Live |
| **Status** | ✅ Live |
| **Description** | Bookmark a job for later reference. Stored locally in the MCP wrapper database. Auto-fills title/company/url from jobs.db if not provided. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `job_id` | string | Yes | — | Must be non-empty |
| `title` | string | No | `""` | — |
| `company` | string | No | `""` | — |
| `url` | string | No | `""` | — |
| `notes` | string | No | `""` | — |

**Return schema:**

```json
{
  "status": "saved",
  "job_id": "ap_linkedin_abc123",
  "title": "Senior Rails Engineer",
  "company": "Stripe"
}
```

**Error cases:**
- Empty job_id → `{"error": "'job_id' is required and must be a non-empty string."}`
- Already bookmarked → `{"status": "already_bookmarked", ...}`

**Example conversation:**

```
User: "Bookmark that 95-score job from yesterday"
Agent: calls save_job(job_id="ap_linkedin_abc123")
```

---

### unsave_job

| | |
|---|---|
| **Tier** | 2 — Live |
| **Status** | ✅ Live |
| **Description** | Remove a job from bookmarks. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `job_id` | string | Yes | — | — |

**Return schema:**

```json
{
  "status": "removed",
  "job_id": "ap_linkedin_abc123"
}
```

**Error cases:**
- Not found → `{"status": "not_found", "job_id": "..."}`

**Example conversation:**

```
User: "Remove that Stripe bookmark"
Agent: calls unsave_job(job_id="ap_linkedin_abc123")
```

---

### get_job_details

| | |
|---|---|
| **Tier** | 2 — Live |
| **Status** | ✅ Live |
| **Description** | Get full details of a scored job by job_id or URL. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `job_id` | string | No | `""` | Provide either job_id or url |
| `url` | string | No | `""` | Provide either job_id or url |

**Return schema:**

```json
{
  "job_id": "ap_linkedin_abc123",
  "title": "Senior Rails Engineer",
  "company": "Stripe",
  "location": "Remote",
  "url": "https://...",
  "score": 92,
  "status": "strong_match",
  "reasoning": "Excellent fit...",
  "materials": "## Tailored Resume Bullets\n...",
  "posted_date": "2025-07-05",
  "is_remote": 1,
  "visa_sponsorship": 0,
  "source": "linkedin",
  "seen_at": "2025-07-06T14:30:00"
}
```

**Error cases:**
- Neither provided → `{"error": "Provide either job_id or url"}`
- Not found → `{"error": "Job not found in database"}`

**Example conversation:**

```
User: "Show me the full details on that Stripe job"
Agent: calls get_job_details(job_id="ap_linkedin_abc123")
```

---

### update_profile

| | |
|---|---|
| **Tier** | 2 — Live |
| **Status** | ✅ Live |
| **Description** | Update a field in profile.json. Changes take effect on next pipeline run. Only whitelisted keys are accepted. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `key` | string | Yes | — | Must be one of: `anchor_skill`, `primary_skills`, `secondary_skills`, `target_titles`, `search_terms`, `keywords`, `location`, `country`, `seniority`, `email` |
| `value` | string | Yes | — | Use JSON string for arrays (e.g. `'["Rails", "Python"]'`) |

**Return schema:**

```json
{
  "status": "updated",
  "key": "anchor_skill",
  "old_value": "Ruby on Rails",
  "new_value": "Python",
  "note": "Restart the bot or re-run pipeline for changes to take effect."
}
```

**Error cases:**
- Key not in whitelist → `{"error": "Key 'foo' is not allowed. Allowed keys: [...]"}`
- profile.json missing → `{"error": "profile.json not found. Run bootstrap first."}`

**Example conversation:**

```
User: "Change my anchor skill to Python"
Agent: calls update_profile(key="anchor_skill", value="Python")
```

---

### export_data

| | |
|---|---|
| **Tier** | 2 — Live |
| **Status** | ✅ Live |
| **Description** | Export all scored jobs from the database as JSON or CSV. Returns data inline (no file written). |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `format` | string | No | `"json"` | Only `"json"` or `"csv"` accepted; unknown values default to `"json"` |

**Return schema (JSON format):**

```json
{
  "format": "json",
  "count": 342,
  "jobs": [
    {"job_id": "...", "title": "...", "score": 92, "...": "..."}
  ]
}
```

**Return schema (CSV format):**

```json
{
  "format": "csv",
  "count": 342,
  "data": "job_id,title,company,...\nap_linkedin_abc123,Senior Rails Engineer,Stripe,..."
}
```

**Error cases:** None expected (returns empty dataset if DB is empty).

**Example conversation:**

```
User: "Export all my scored jobs as CSV"
Agent: calls export_data(format="csv")
```

---

## Tier 3 — Implemented (wrapper-local storage)

### add_interview

| | |
|---|---|
| **Tier** | 3 — Implemented |
| **Status** | ✅ Live |
| **Description** | Track an upcoming interview. Stored in wrapper.db. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `job_id` | string | No | `""` | — |
| `company` | string | Yes | — | — |
| `role` | string | No | `""` | — |
| `datetime` | string | Yes | — | ISO datetime format |
| `notes` | string | No | `""` | — |

**Return schema:**

```json
{
  "status": "added",
  "interview_id": 3,
  "company": "Stripe",
  "datetime": "2025-07-15T15:00:00"
}
```

**Error cases:** None expected.

**Example conversation:**

```
User: "I have an interview with Stripe next Tuesday at 3pm"
Agent: calls add_interview(company="Stripe", datetime="2025-07-15T15:00:00")
```

---

### get_upcoming_interviews

| | |
|---|---|
| **Tier** | 3 — Implemented |
| **Status** | ✅ Live |
| **Description** | List upcoming interviews (future dates only). |

**Parameters:** None

**Return schema:**

```json
{
  "count": 2,
  "interviews": [
    {
      "id": 1,
      "job_id": "",
      "company": "Stripe",
      "role": "Senior Rails Engineer",
      "datetime": "2025-07-15T15:00:00",
      "notes": ""
    }
  ]
}
```

**Error cases:** None expected (returns empty list if none scheduled).

**Example conversation:**

```
User: "What interviews do I have coming up?"
Agent: calls get_upcoming_interviews()
```

---

### set_reminder

| | |
|---|---|
| **Tier** | 3 — Implemented |
| **Status** | ✅ Live |
| **Description** | Set a follow-up reminder. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `message` | string | Yes | — | Must be non-empty |
| `due_at` | string | Yes | — | Must be non-empty; ISO date or datetime |

**Return schema:**

```json
{
  "status": "set",
  "reminder_id": 5,
  "message": "Follow up with Stripe",
  "due_at": "2025-07-10"
}
```

**Error cases:**
- Empty message or due_at → `{"error": "'message' is required and must be a non-empty string."}`

**Example conversation:**

```
User: "Remind me to follow up with Stripe in 3 days"
Agent: calls set_reminder(message="Follow up with Stripe", due_at="2025-07-10")
```

---

### get_reminders

| | |
|---|---|
| **Tier** | 3 — Implemented |
| **Status** | ✅ Live |
| **Description** | Get active reminders. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `include_done` | boolean | No | `false` | Include completed reminders |

**Return schema:**

```json
{
  "count": 2,
  "reminders": [
    {
      "id": 1,
      "message": "Follow up with Stripe",
      "due_at": "2025-07-10",
      "done": false,
      "created_at": "2025-07-07T12:00:00"
    }
  ]
}
```

**Error cases:** None expected.

**Example conversation:**

```
User: "What reminders do I have?"
Agent: calls get_reminders()
```

---

### dismiss_reminder

| | |
|---|---|
| **Tier** | 3 — Implemented |
| **Status** | ✅ Live |
| **Description** | Mark a reminder as done. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `reminder_id` | integer | Yes | — | — |

**Return schema:**

```json
{
  "status": "dismissed",
  "reminder_id": 5
}
```

**Error cases:**
- Not found → `{"status": "not_found", "reminder_id": 5}`

**Example conversation:**

```
User: "I followed up with Stripe, dismiss that reminder"
Agent: calls dismiss_reminder(reminder_id=5)
```

---

### get_bot_status

| | |
|---|---|
| **Tier** | 3 — Partial |
| **Status** | ✅ Partial |
| **Description** | Get current bot status: last run time, interval, and configuration. |

**Parameters:** None

**Return schema:**

```json
{
  "status": "running",
  "last_apify_run": "2025-07-07T10:00:00",
  "interval_hours": 1,
  "note": "Pause/resume functionality pending — requires GitHub Actions API integration."
}
```

**Error cases:** None expected.

**Example conversation:**

```
User: "When did the bot last run?"
Agent: calls get_bot_status()
```

---

### compare_jobs

| | |
|---|---|
| **Tier** | 3 — Stub |
| **Status** | 🔜 Stub |
| **Description** | Compare two or more jobs side by side. Not yet implemented. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `job_ids` | array of strings | Yes | — | — |

**Return schema:**

```json
{
  "status": "pending",
  "tool": "compare_jobs",
  "message": "'compare_jobs' is not yet implemented. It will be available in a future update."
}
```

**Error cases:** Always returns stub response.

**Example conversation:**

```
User: "Compare the Stripe and Figma roles side by side"
Agent: calls compare_jobs(job_ids=["ap_linkedin_abc123", "gh_figma_def456"])
```

---

### get_company_info

| | |
|---|---|
| **Tier** | 3 — Stub |
| **Status** | 🔜 Stub |
| **Description** | Get company enrichment data. Not yet implemented. |

**Parameters:**

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `company` | string | Yes | — | — |

**Return schema:**

```json
{
  "status": "pending",
  "tool": "get_company_info",
  "message": "'get_company_info' is not yet implemented. It will be available in a future update."
}
```

**Error cases:** Always returns stub response.

**Example conversation:**

```
User: "Tell me about Stripe as a company"
Agent: calls get_company_info(company="Stripe")
```

---

### pause_bot

| | |
|---|---|
| **Tier** | 3 — Stub |
| **Status** | 🔜 Stub |
| **Description** | Pause the hourly job search cron. Not yet implemented. |

**Parameters:** None

**Return schema:**

```json
{
  "status": "pending",
  "tool": "pause_bot",
  "message": "'pause_bot' is not yet implemented. It will be available in a future update."
}
```

**Error cases:** Always returns stub response.

**Example conversation:**

```
User: "Pause the bot for now"
Agent: calls pause_bot()
```

---

### resume_bot

| | |
|---|---|
| **Tier** | 3 — Stub |
| **Status** | 🔜 Stub |
| **Description** | Resume the hourly job search cron. Not yet implemented. |

**Parameters:** None

**Return schema:**

```json
{
  "status": "pending",
  "tool": "resume_bot",
  "message": "'resume_bot' is not yet implemented. It will be available in a future update."
}
```

**Error cases:** Always returns stub response.

**Example conversation:**

```
User: "Resume the bot"
Agent: calls resume_bot()
```
