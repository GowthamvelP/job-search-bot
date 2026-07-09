# mcp-wrapper/tools.py
#
# Rationale: Same-repo today. Each tool is a thin async wrapper around the bot's
# existing synchronous functions. No business logic lives here — just argument
# parsing, bot function invocation, and result formatting.

"""
MCP tool definitions and handlers for the job-search-bot.

Each tool maps directly to a bot capability:
  - search_jobs   → discovery.fetch_new_postings()
  - score_job     → main.score_job() + main._compute_skill_bonus()
  - run_pipeline  → main.run()
  - flush_db      → db.flush_db()
  - bootstrap     → bootstrap.run()
"""

import json
import asyncio
from functools import partial

from mcp.types import Tool

# Bot imports (via the sys.path setup in server.py)
import bot
from bot import main as bot_main
from bot import discovery, db, config

# ---------------------------------------------------------------------------
# Tool definitions (exposed to MCP clients)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS = [
    Tool(
        name="search_jobs",
        description=(
            "Fetch and filter job postings from all configured sources "
            "(Apify: LinkedIn, Indeed, Glassdoor, Naukri + Greenhouse/Lever). "
            "Returns jobs matching keywords, date range, and location/visa filters. "
            "Does NOT score them — use score_job or run_pipeline for that."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "posted_within_days": {
                    "type": "integer",
                    "description": "Only include jobs posted in the last N days. Defaults to config value.",
                },
            },
            "required": [],
        },
    ),
    Tool(
        name="score_job",
        description=(
            "Score a single job posting against the candidate's resume using hybrid scoring "
            "(Gemini AI semantic fit 0-100 + deterministic skill-alignment bonus 0-30). "
            "Returns the final score, Gemini score, skill bonus, and reasoning."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Job title"},
                "company": {"type": "string", "description": "Company name"},
                "location": {"type": "string", "description": "Job location"},
                "url": {"type": "string", "description": "Job URL"},
                "text": {"type": "string", "description": "Job description text"},
                "is_remote": {"type": "boolean", "description": "Whether the job is remote"},
            },
            "required": ["title", "company", "url", "text"],
        },
    ),
    Tool(
        name="run_pipeline",
        description=(
            "Execute the full job search pipeline: fetch → filter → score → "
            "generate materials for strong matches → email CSV digest. "
            "This is equivalent to running `python main.py`."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "flush": {
                    "type": "boolean",
                    "description": "Reset the database before running (re-score everything fresh). Default: false.",
                },
            },
            "required": [],
        },
    ),
    Tool(
        name="flush_db",
        description=(
            "Reset the jobs database — deletes all scored jobs and rate-limit timestamps. "
            "The next pipeline run will re-fetch and re-score everything from scratch."
        ),
        inputSchema={
            "type": "object",
            "properties": {},
            "required": [],
        },
    ),
    Tool(
        name="bootstrap",
        description=(
            "Regenerate profile.json from resume.txt using Gemini. Extracts anchor_skill, "
            "primary_skills, search_terms, keywords, location, and seniority. "
            "Run this after updating the resume."
        ),
        inputSchema={
            "type": "object",
            "properties": {},
            "required": [],
        },
    ),
]


# ---------------------------------------------------------------------------
# Tool handlers
# ---------------------------------------------------------------------------

async def tool_search_jobs(arguments: dict) -> str:
    """Fetch and filter jobs from all sources."""
    db.init_db()

    # Temporarily override POSTED_WITHIN_DAYS if provided
    original = config.POSTED_WITHIN_DAYS
    if "posted_within_days" in arguments:
        config.POSTED_WITHIN_DAYS = arguments["posted_within_days"]

    try:
        jobs = await asyncio.to_thread(discovery.fetch_new_postings)
    finally:
        config.POSTED_WITHIN_DAYS = original

    # Format results
    results = []
    for j in jobs[:50]:  # cap at 50 for response size
        results.append({
            "title": j["title"],
            "company": j["company"],
            "location": j.get("location", ""),
            "url": j["url"],
            "posted_date": j.get("posted_date", ""),
            "is_remote": j.get("is_remote", False),
            "visa_sponsorship": j.get("visa_sponsorship", False),
            "source": j.get("source", ""),
        })

    return json.dumps({
        "total_fetched": len(jobs),
        "returned": len(results),
        "jobs": results,
    }, indent=2)


async def tool_score_job(arguments: dict) -> str:
    """Score a single job against the resume."""
    db.init_db()

    job = {
        "id": f"mcp_{hash(arguments['url'])}",
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
        return json.dumps({
            "error": "All Gemini model quotas exhausted for today. Try again after midnight Pacific.",
            "skill_bonus": skill_bonus,
        })

    final_score = min(gemini_score + skill_bonus, 100)

    return json.dumps({
        "final_score": final_score,
        "gemini_score": gemini_score,
        "skill_bonus": skill_bonus,
        "reasoning": reasoning,
        "is_strong_match": final_score >= config.SCORE_THRESHOLD,
    }, indent=2)


async def tool_run_pipeline(arguments: dict) -> str:
    """Run the full pipeline."""
    flush = arguments.get("flush", False)

    # Capture stdout for the response
    import io
    from contextlib import redirect_stdout

    buffer = io.StringIO()
    try:
        with redirect_stdout(buffer):
            await asyncio.to_thread(bot_main.run, flush=flush)
        output = buffer.getvalue()
    except Exception as e:
        output = f"Pipeline failed: {e}"

    return json.dumps({
        "status": "completed",
        "output": output,
    }, indent=2)


async def tool_flush_db(arguments: dict) -> str:
    """Flush the database."""
    db.init_db()
    await asyncio.to_thread(db.flush_db)
    return json.dumps({"status": "flushed", "message": "Database reset. Next run will re-fetch and re-score everything."})


async def tool_bootstrap(arguments: dict) -> str:
    """Regenerate profile.json from resume."""
    from bot import bootstrap as bot_bootstrap

    import io
    from contextlib import redirect_stdout

    buffer = io.StringIO()
    try:
        with redirect_stdout(buffer):
            await asyncio.to_thread(bot_bootstrap.run)
        output = buffer.getvalue()
        return json.dumps({"status": "completed", "output": output})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})
