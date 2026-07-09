# Security Audit — MCP Wrapper

Last audited: 2025-07-07

---

## What Was Audited

| Check | File(s) | Result |
|-------|---------|--------|
| SQL injection | tools.py, storage.py | **Safe** — all queries use parameterized statements (`?`) with no string concatenation |
| Credential exposure | tools.py (`run_health_check`) | **Safe** — reports "set"/"MISSING" only, never returns actual API key values |
| Subprocess usage | tools.py, server.py | **Safe** — no `subprocess`, `os.system`, or `exec` calls |
| File path traversal | tools.py (`update_profile`) | **Safe** — writes only to hardcoded `profile.json` path |
| Profile key injection | tools.py (`update_profile`) | **Fixed** — whitelist enforced (see below) |
| Numeric parameter overflow | tools.py | **Fixed** — all numeric inputs clamped to safe ranges |
| Empty string abuse | tools.py | **Fixed** — required string params validated for non-empty content |
| Export format injection | tools.py (`export_data`) | **Fixed** — enum validated, defaults to "json" |
| Inline data return | tools.py (`export_data`) | **Safe** — returns data inline, never writes to arbitrary file paths |
| MCP transport | server.py | **Safe** — stdio only, no network listener |

---

## What Was Fixed

### 1. Profile key whitelist (`update_profile`)

Previously accepted any key, allowing arbitrary JSON fields to be injected into `profile.json`.

**Fix:** Added `ALLOWED_PROFILE_KEYS` whitelist. Only these keys are accepted:

```
anchor_skill, primary_skills, secondary_skills, target_titles,
search_terms, keywords, location, country, seniority, email
```

Any other key returns an error with the allowed set listed.

### 2. Numeric input clamping

| Parameter | Tool(s) | Allowed Range |
|-----------|---------|---------------|
| `posted_within_days` | `search_jobs` | 1–90 |
| `hours` | `get_analytics`, `get_saved_jobs` | 1–8760 (1 year) |
| `min_score` | `get_saved_jobs` | 0–100 |

Values outside these ranges are silently clamped to the nearest bound.

### 3. Required string validation

| Tool | Required non-empty fields |
|------|--------------------------|
| `score_job` | title, company, url, text |
| `generate_cover_letter` | title, company, text |
| `save_job` | job_id |
| `set_reminder` | message, due_at |

Empty or whitespace-only strings return a clear error message.

### 4. Export format enum validation (`export_data`)

Only `"json"` and `"csv"` are accepted. Any other value silently defaults to `"json"`.

---

## Assumptions and Remaining Risks

| Assumption | Risk if violated |
|------------|-----------------|
| MCP transport is local stdio | If exposed over network, all tools become remotely callable without auth |
| Bot's `config.py` loads secrets from env vars | If `.env` file is committed to git, secrets leak |
| `profile.json` is a local file | No ACL — any local process can read/write it |
| AI agent is trusted to make reasonable calls | A malicious prompt could call `flush_db` or `run_pipeline` repeatedly (rate limiting is the bot's responsibility) |
| `wrapper.db` has no encryption | Bookmarks and reminders are stored in plain SQLite |
| Gemini API key is passed via env var | If the MCP client config is shared, the key may leak |

### Not in scope

- Authentication/authorization of MCP clients (MCP spec does not define this)
- Rate limiting at the wrapper level (delegated to bot and upstream APIs)
- Encryption at rest for local databases
- Network isolation (stdio transport makes this moot)

---

## Design Principles

1. **No auto-apply** — The bot never submits job applications. Every tool surfaces information; the human decides and acts.

2. **Local-only stdio transport** — The MCP server communicates via stdin/stdout. It does not bind to any network port or accept remote connections.

3. **No credential exposure** — API keys are read from environment variables. The `run_health_check` tool reports presence ("set"/"MISSING") but never returns actual values.

4. **Wrapper-only storage** — MCP-specific data (bookmarks, interviews, reminders) lives in `wrapper.db`, completely separate from the bot's `jobs.db`. The wrapper never modifies bot state except through documented bot functions.

5. **Parameterized queries everywhere** — All SQL uses `?` placeholders. No string interpolation in query construction.

6. **Hardcoded file paths** — `update_profile` writes only to `profile.json` (relative to working directory). No user-controlled path input.

7. **Input validation at the boundary** — All tool handlers validate inputs before passing to bot functions or storage.
