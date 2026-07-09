# mcp-wrapper/tools.py
#
# Complete MCP tool set for job-search-bot.
# Tier 1: Real tools wrapping bot functions (10)
# Tier 2: Wrapper-local tools with own storage (5)
# Tier 3: Stubs with structure only (10)
# Tier 4: Skipped — contradicts bot design (not present)

import json
import os
import sys
import asyncio
import csv
import io
import sqlite3
from contextlib import closing

# Bot imports (via sys.path setup in server.py)
import bot
from bot import main as bot_main
from bot import discovery, db, config
from bot import bootstrap as bot_bootstrap

# Wrapper-local storage
import storage


# ===========================================================================
# SECURITY — Input validation helpers
# ===========================================================================

ALLOWED_PROFILE_KEYS = {
    "anchor_skill", "primary_skills", "secondary_skills", "target_titles",
    "search_terms", "keywords", "location", "country", "seniority", "email",
}

ALLOWED_EXPORT_FORMATS = {"json", "csv"}


def _clamp(value: int | float, lo: int | float, hi: int | float) -> int | float:
    """Clamp a numeric value to [lo, hi]."""
    return max(lo, min(hi, value))


def _require_non_empty(arguments: dict, keys: list[str]) -> str | None:
    """Return an error JSON string if any key in arguments is empty after strip, else None."""
    for key in keys:
        val = arguments.get(key, "")
        if not isinstance(val, str) or not val.strip():
            return json.dumps({"error": f"'{key}' is required and must be a non-empty string."})
    return None


# ===========================================================================
# TIER 1 — Real Tools (wrap existing bot functions)
# ===========================================================================

async def tool_search_jobs(arguments: dict) -> str:
    """Fetch and filter jobs from all configured sources."""
    db.init_db()

    original = config.POSTED_WITHIN_DAYS
    if "posted_within_days" in arguments:
        config.POSTED_WITHIN_DAYS = int(_clamp(arguments["posted_within_days"], 1, 90))

    try:
        jobs = await asyncio.to_thread(discovery.fetch_new_postings)
    finally:
        config.POSTED_WITHIN_DAYS = original

    results = []
    for j in jobs[:50]:
        results.append({
            "id": j.get("id", ""),
            "title": j["title"],
            "company": j["company"],
            "location": j.get("location", ""),
            "url": j["url"],
            "posted_date": j.get("posted_date", ""),
            "is_remote": j.get("is_remote", False),
            "visa_sponsorship": j.get("visa_sponsorship", False),
            "source": j.get("source", ""),
        })

    return json.dumps({"total_fetched": len(jobs), "returned": len(results), "jobs": results}, indent=2)


async def tool_score_job(arguments: dict) -> str:
    """Score a single job using hybrid scoring (Gemini + skill bonus)."""
    # Validate required non-empty strings
    err = _require_non_empty(arguments, ["title", "company", "url", "text"])
    if err:
        return err

    db.init_db()

    job = {
        "id": f"mcp_{abs(hash(arguments['url']))}",
        "title": arguments["title"],
        "company": arguments["company"],
        "location": arguments.get("location", ""),
        "url": arguments["url"],
        "text": arguments["text"],
        "is_remote": arguments.get("is_remote", False),
        "visa_sponsorship": False,
        "posted_date": "",
        "source": "mcp",
    }

    skill_bonus = bot_main._compute_skill_bonus(job)

    try:
        gemini_score, reasoning = await asyncio.to_thread(bot_main.score_job, job)
    except bot_main.QuotaExhaustedError:
        return json.dumps({"error": "All Gemini model quotas exhausted. Try after midnight Pacific.", "skill_bonus": skill_bonus})

    final_score = min(gemini_score + skill_bonus, 100)
    return json.dumps({
        "final_score": final_score,
        "gemini_score": gemini_score,
        "skill_bonus": skill_bonus,
        "reasoning": reasoning,
        "is_strong_match": final_score >= config.SCORE_THRESHOLD,
    }, indent=2)


async def tool_run_pipeline(arguments: dict) -> str:
    """Execute the full pipeline: fetch → score → email."""
    flush = arguments.get("flush", False)

    import io as _io
    from contextlib import redirect_stdout
    buffer = _io.StringIO()
    try:
        with redirect_stdout(buffer):
            await asyncio.to_thread(bot_main.run, flush=flush)
        return json.dumps({"status": "completed", "output": buffer.getvalue()}, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e), "partial_output": buffer.getvalue()})


async def tool_flush_db(arguments: dict) -> str:
    """Reset the jobs database for fresh scoring."""
    db.init_db()
    await asyncio.to_thread(db.flush_db)
    return json.dumps({"status": "flushed", "message": "Database reset. Next run will re-fetch and re-score everything."})


async def tool_bootstrap(arguments: dict) -> str:
    """Regenerate profile.json from resume.txt."""
    import io as _io
    from contextlib import redirect_stdout
    buffer = _io.StringIO()
    try:
        with redirect_stdout(buffer):
            await asyncio.to_thread(bot_bootstrap.run)
        return json.dumps({"status": "completed", "output": buffer.getvalue()})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


async def tool_generate_cover_letter(arguments: dict) -> str:
    """Generate tailored resume bullets and cover letter for a specific job."""
    # Validate required non-empty strings
    err = _require_non_empty(arguments, ["title", "company", "text"])
    if err:
        return err

    job = {
        "title": arguments["title"],
        "company": arguments["company"],
        "location": arguments.get("location", ""),
        "url": arguments.get("url", ""),
        "text": arguments["text"],
    }

    try:
        materials = await asyncio.to_thread(bot_main.generate_materials, job)
        return json.dumps({"status": "completed", "materials": materials}, indent=2)
    except bot_main.QuotaExhaustedError:
        return json.dumps({"status": "error", "message": "Gemini quota exhausted. Try after midnight Pacific."})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


async def tool_get_platforms(arguments: dict) -> str:
    """Return configured job sources and boards."""
    return json.dumps({
        "apify_boards": config.APIFY_JOB_BOARDS,
        "apify_search_terms": config.APIFY_SEARCH_TERMS,
        "greenhouse_companies": config.GREENHOUSE_COMPANIES,
        "lever_companies": config.LEVER_COMPANIES,
        "jsearch_enabled": config.JSEARCH_ENABLED,
        "anchor_skill": config.ANCHOR_SKILL,
        "posted_within_days": config.POSTED_WITHIN_DAYS,
    }, indent=2)


async def tool_get_analytics(arguments: dict) -> str:
    """Return scoring analytics from jobs.db."""
    db.init_db()
    hours = int(_clamp(arguments.get("hours", 168), 1, 8760))  # default: last 7 days

    with closing(sqlite3.connect(config.DB_PATH)) as conn:
        total = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        strong = conn.execute("SELECT COUNT(*) FROM jobs WHERE status = 'strong_match'").fetchone()[0]
        below = conn.execute("SELECT COUNT(*) FROM jobs WHERE status = 'below_threshold'").fetchone()[0]
        errors = conn.execute("SELECT COUNT(*) FROM jobs WHERE status = 'score_error'").fetchone()[0]
        avg_score = conn.execute("SELECT AVG(score) FROM jobs WHERE score > 0").fetchone()[0]

        by_source = conn.execute(
            "SELECT source, COUNT(*), AVG(score) FROM jobs GROUP BY source ORDER BY COUNT(*) DESC"
        ).fetchall()

        recent = conn.execute(
            "SELECT COUNT(*) FROM jobs WHERE seen_at >= datetime('now', ?)", (f"-{hours} hours",)
        ).fetchone()[0]

    return json.dumps({
        "total_jobs_scored": total,
        "strong_matches": strong,
        "below_threshold": below,
        "score_errors": errors,
        "average_score": round(avg_score, 1) if avg_score else 0,
        "jobs_last_period": recent,
        "period_hours": hours,
        "by_source": [{"source": r[0] or "unknown", "count": r[1], "avg_score": round(r[2] or 0, 1)} for r in by_source],
    }, indent=2)


async def tool_get_saved_jobs(arguments: dict) -> str:
    """Return previously scored jobs from the database."""
    db.init_db()
    hours = int(_clamp(arguments.get("hours", 24), 1, 8760))
    min_score = int(_clamp(arguments.get("min_score", 0), 0, 100))

    with closing(sqlite3.connect(config.DB_PATH)) as conn:
        rows = conn.execute("""
            SELECT job_id, title, company, location, url, score, status,
                   reasoning, posted_date, is_remote, visa_sponsorship, source
            FROM jobs
            WHERE seen_at >= datetime('now', ?) AND score >= ?
            ORDER BY score DESC
            LIMIT 50
        """, (f"-{hours} hours", min_score)).fetchall()

    cols = ["job_id", "title", "company", "location", "url", "score", "status",
            "reasoning", "posted_date", "is_remote", "visa_sponsorship", "source"]
    jobs = [dict(zip(cols, r)) for r in rows]

    return json.dumps({"count": len(jobs), "jobs": jobs}, indent=2)


async def tool_run_health_check(arguments: dict) -> str:
    """Validate that all bot dependencies are configured and accessible."""
    checks = {}

    # API keys
    checks["gemini_api_key"] = "set" if config.GEMINI_API_KEY else "MISSING"
    checks["apify_api_key"] = "set" if config.APIFY_API_KEY else "MISSING"
    checks["gmail_address"] = "set" if config.EMAIL_FROM else "MISSING"
    checks["gmail_app_password"] = "set" if config.EMAIL_APP_PASSWORD else "MISSING"

    # Resume file
    checks["resume_file"] = "exists" if os.path.exists(config.RESUME_PATH) else "MISSING"

    # Profile
    checks["profile_json"] = "loaded" if config._profile else "MISSING (using fallbacks)"
    checks["anchor_skill"] = config.ANCHOR_SKILL

    # DB writable
    try:
        db.init_db()
        db.set_meta("health_check", "ok")
        checks["database"] = "writable"
    except Exception as e:
        checks["database"] = f"ERROR: {e}"

    # Overall
    all_ok = all(
        v not in ("MISSING", ) and not v.startswith("ERROR")
        for v in checks.values()
    )
    checks["overall"] = "healthy" if all_ok else "issues_detected"

    return json.dumps(checks, indent=2)


# ===========================================================================
# TIER 2 — Wrapper-local Tools (own SQLite storage)
# ===========================================================================

async def tool_save_job(arguments: dict) -> str:
    """Bookmark a job for later reference."""
    # Validate required non-empty string
    err = _require_non_empty(arguments, ["job_id"])
    if err:
        return err

    job_id = arguments["job_id"]
    title = arguments.get("title", "")
    company = arguments.get("company", "")
    url = arguments.get("url", "")
    notes = arguments.get("notes", "")

    # Try to fill from jobs.db if not provided
    if not title or not company:
        db.init_db()
        with closing(sqlite3.connect(config.DB_PATH)) as conn:
            row = conn.execute(
                "SELECT title, company, url FROM jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
            if row:
                title = title or row[0]
                company = company or row[1]
                url = url or row[2]

    is_new = storage.save_bookmark(job_id, title, company, url, notes)
    return json.dumps({
        "status": "saved" if is_new else "already_bookmarked",
        "job_id": job_id,
        "title": title,
        "company": company,
    })


async def tool_unsave_job(arguments: dict) -> str:
    """Remove a job from bookmarks."""
    removed = storage.remove_bookmark(arguments["job_id"])
    return json.dumps({
        "status": "removed" if removed else "not_found",
        "job_id": arguments["job_id"],
    })


async def tool_get_job_details(arguments: dict) -> str:
    """Get full details of a scored job from the database."""
    db.init_db()
    job_id = arguments.get("job_id", "")
    url = arguments.get("url", "")

    with closing(sqlite3.connect(config.DB_PATH)) as conn:
        if job_id:
            row = conn.execute("""
                SELECT job_id, title, company, location, url, score, status,
                       reasoning, materials, posted_date, is_remote, visa_sponsorship, source, seen_at
                FROM jobs WHERE job_id = ?
            """, (job_id,)).fetchone()
        elif url:
            row = conn.execute("""
                SELECT job_id, title, company, location, url, score, status,
                       reasoning, materials, posted_date, is_remote, visa_sponsorship, source, seen_at
                FROM jobs WHERE url = ?
            """, (url,)).fetchone()
        else:
            return json.dumps({"error": "Provide either job_id or url"})

    if not row:
        return json.dumps({"error": "Job not found in database"})

    cols = ["job_id", "title", "company", "location", "url", "score", "status",
            "reasoning", "materials", "posted_date", "is_remote", "visa_sponsorship", "source", "seen_at"]
    return json.dumps(dict(zip(cols, row)), indent=2)


async def tool_update_profile(arguments: dict) -> str:
    """Update a field in profile.json. Requires bot restart to take effect."""
    profile_path = "profile.json"
    if not os.path.exists(profile_path):
        return json.dumps({"error": "profile.json not found. Run bootstrap first."})

    key = arguments["key"]

    # Whitelist allowed keys
    if key not in ALLOWED_PROFILE_KEYS:
        return json.dumps({
            "error": f"Key '{key}' is not allowed. Allowed keys: {sorted(ALLOWED_PROFILE_KEYS)}",
        })

    with open(profile_path, "r") as f:
        profile = json.load(f)
    value = arguments["value"]

    # Parse value as JSON if it looks like a list/dict
    if isinstance(value, str) and (value.startswith("[") or value.startswith("{")):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            pass

    old_value = profile.get(key, "<not set>")
    profile[key] = value

    with open(profile_path, "w") as f:
        json.dump(profile, f, indent=2)

    return json.dumps({
        "status": "updated",
        "key": key,
        "old_value": old_value,
        "new_value": value,
        "note": "Restart the bot or re-run pipeline for changes to take effect.",
    }, indent=2)


async def tool_export_data(arguments: dict) -> str:
    """Export all scored jobs from jobs.db as JSON."""
    db.init_db()
    fmt = arguments.get("format", "json")

    # Validate format enum — default to json for unknown values
    if fmt not in ALLOWED_EXPORT_FORMATS:
        fmt = "json"

    return_file_path = arguments.get("return_file_path", False)

    with closing(sqlite3.connect(config.DB_PATH)) as conn:
        rows = conn.execute("""
            SELECT job_id, title, company, location, url, score, status,
                   reasoning, posted_date, is_remote, visa_sponsorship, source, seen_at
            FROM jobs ORDER BY score DESC
        """).fetchall()

    cols = ["job_id", "title", "company", "location", "url", "score", "status",
            "reasoning", "posted_date", "is_remote", "visa_sponsorship", "source", "seen_at"]
    jobs = [dict(zip(cols, r)) for r in rows]

    if return_file_path:
        # Write to mcp-wrapper/exports/ directory
        exports_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "exports")
        os.makedirs(exports_dir, exist_ok=True)
        from datetime import datetime, timezone
        timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"jobs_export_{timestamp}.{fmt}"
        filepath = os.path.join(exports_dir, filename)

        if fmt == "csv":
            with open(filepath, "w", newline="") as f:
                if jobs:
                    writer = csv.DictWriter(f, fieldnames=cols)
                    writer.writeheader()
                    writer.writerows(jobs)
        else:
            with open(filepath, "w") as f:
                json.dump({"count": len(jobs), "jobs": jobs}, f, indent=2)

        return json.dumps({"format": fmt, "count": len(jobs), "file_path": filepath})
    else:
        if fmt == "csv":
            output = io.StringIO()
            if jobs:
                writer = csv.DictWriter(output, fieldnames=cols)
                writer.writeheader()
                writer.writerows(jobs)
            return json.dumps({"format": "csv", "count": len(jobs), "data": output.getvalue()})
        else:
            return json.dumps({"format": "json", "count": len(jobs), "jobs": jobs}, indent=2)


# ===========================================================================
# TIER 3 — Stubs (structure only, return pending)
# ===========================================================================

def _stub(tool_name: str) -> str:
    return json.dumps({"status": "pending", "tool": tool_name, "message": f"'{tool_name}' is not yet implemented. It will be available in a future update."})


async def tool_add_interview(arguments: dict) -> str:
    """Add an interview to your pipeline tracker."""
    job_id = arguments.get("job_id", "")
    company = arguments["company"]
    role = arguments.get("role", "")
    dt = arguments["datetime"]
    notes = arguments.get("notes", "")

    interview_id = storage.add_interview(job_id, company, role, dt, notes)
    return json.dumps({"status": "added", "interview_id": interview_id, "company": company, "datetime": dt})


async def tool_get_upcoming_interviews(arguments: dict) -> str:
    """Get upcoming interviews."""
    interviews = storage.get_interviews(upcoming_only=True)
    return json.dumps({"count": len(interviews), "interviews": interviews}, indent=2)


async def tool_set_reminder(arguments: dict) -> str:
    """Set a follow-up reminder."""
    # Validate required non-empty strings
    err = _require_non_empty(arguments, ["message", "due_at"])
    if err:
        return err

    message = arguments["message"]
    due_at = arguments["due_at"]
    reminder_id = storage.add_reminder(message, due_at)
    return json.dumps({"status": "set", "reminder_id": reminder_id, "message": message, "due_at": due_at})


async def tool_get_reminders(arguments: dict) -> str:
    """Get active reminders."""
    reminders = storage.get_reminders(include_done=arguments.get("include_done", False))
    return json.dumps({"count": len(reminders), "reminders": reminders}, indent=2)


async def tool_dismiss_reminder(arguments: dict) -> str:
    """Mark a reminder as done."""
    dismissed = storage.dismiss_reminder(arguments["reminder_id"])
    return json.dumps({"status": "dismissed" if dismissed else "not_found", "reminder_id": arguments["reminder_id"]})


async def tool_compare_jobs(arguments: dict) -> str:
    """Compare two or more jobs side by side."""
    job_ids = arguments.get("job_ids", [])
    if not job_ids or len(job_ids) < 2:
        return json.dumps({"error": "Provide at least 2 job_ids to compare."})
    if len(job_ids) > 5:
        return json.dumps({"error": "Maximum 5 jobs can be compared at once."})

    db.init_db()
    jobs = []
    not_found = []

    with closing(sqlite3.connect(config.DB_PATH)) as conn:
        for jid in job_ids:
            row = conn.execute("""
                SELECT job_id, title, company, location, score, status,
                       reasoning, posted_date, is_remote, visa_sponsorship, source
                FROM jobs WHERE job_id = ?
            """, (jid,)).fetchone()
            if row:
                cols = ["job_id", "title", "company", "location", "score", "status",
                        "reasoning", "posted_date", "is_remote", "visa_sponsorship", "source"]
                jobs.append(dict(zip(cols, row)))
            else:
                not_found.append(jid)

    if not jobs:
        return json.dumps({"error": "None of the provided job_ids were found in the database.", "not_found": not_found})

    # Find best match
    best = max(jobs, key=lambda j: j.get("score", 0))

    result = {
        "compared": len(jobs),
        "not_found": not_found,
        "jobs": jobs,
        "best_match": {
            "job_id": best["job_id"],
            "title": best["title"],
            "company": best["company"],
            "score": best["score"],
            "reason": f"Highest score ({best['score']}/100): {best.get('reasoning', 'N/A')}"
        },
    }
    return json.dumps(result, indent=2)


async def tool_get_company_info(arguments: dict) -> str:
    """Get company information and enrichment data."""
    return _stub("get_company_info")


async def tool_pause_bot(arguments: dict) -> str:
    """Pause the hourly job search cron."""
    return _stub("pause_bot")


async def tool_resume_bot(arguments: dict) -> str:
    """Resume the hourly job search cron."""
    return _stub("resume_bot")


async def tool_get_bot_status(arguments: dict) -> str:
    """Get current bot status (running, paused, last run time)."""
    # Partially implementable — read last run from meta
    db.init_db()
    last_apify = db.get_meta("apify_last_run") or "never"
    return json.dumps({
        "status": "running",
        "last_apify_run": last_apify,
        "interval_hours": config.APIFY_INTERVAL_HOURS,
        "note": "Pause/resume functionality pending — requires GitHub Actions API integration.",
    }, indent=2)
