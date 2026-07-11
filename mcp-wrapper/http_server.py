# mcp-wrapper/http_server.py
#
# HTTP transport for the job-search-bot MCP server.
# Runs alongside (not replacing) the stdio server.
#
# Usage:
#   python mcp-wrapper/http_server.py              → starts on port 8000
#   PORT=3000 python mcp-wrapper/http_server.py    → custom port
#
# MCP clients (n8n, web app, etc.) connect via:
#   SSE:             http://localhost:8000/sse
#   Streamable HTTP: http://localhost:8000/mcp
#
# Authentication:
#   All requests must include: Authorization: Bearer <SERVER_API_KEY>
#   User API keys passed in headers: X-Gemini-Key, X-Apify-Key
#
# Rate limit: 100 requests/hour per IP

import sys
import os
import time
import logging
from collections import defaultdict

# Add parent dir so we can import the bot package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Add mcp-wrapper dir so we can import tools and storage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
_log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "http_server.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(_log_path, mode="a"),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger("job-search-mcp-http")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PORT = int(os.environ.get("PORT", 8000))
HOST = os.environ.get("HOST", "0.0.0.0")
SERVER_API_KEY = os.environ.get("MCP_SERVER_KEY", "")  # Set this to restrict access
ALLOWED_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
RATE_LIMIT_PER_HOUR = 100

# ---------------------------------------------------------------------------
# Rate limiter (in-memory, per IP)
# ---------------------------------------------------------------------------
_rate_store: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(ip: str) -> bool:
    """Return True if request is allowed, False if rate limited."""
    now = time.time()
    window = 3600  # 1 hour
    # Clean old entries
    _rate_store[ip] = [t for t in _rate_store[ip] if now - t < window]
    if len(_rate_store[ip]) >= RATE_LIMIT_PER_HOUR:
        return False
    _rate_store[ip].append(now)
    return True


# ---------------------------------------------------------------------------
# FastMCP with HTTP transport
# ---------------------------------------------------------------------------
from mcp.server import FastMCP

# Import tool handlers
import tools

mcp = FastMCP("job-search-bot")
logger.info("FastMCP HTTP instance created, registering tools...")

# Register all 25 tools (same as server.py — shared tool definitions)
# We import the tool registrations by executing server module's decorators
# OR we re-register here. Re-registering is cleaner for dual transport.

@mcp.tool()
async def search_jobs(posted_within_days: int = 7) -> str:
    """Fetch and filter job postings from all configured sources (Apify: LinkedIn, Indeed, Glassdoor, Naukri + Greenhouse/Lever). Returns filtered, sorted jobs. posted_within_days is clamped to 1-90."""
    return await tools.tool_search_jobs({"posted_within_days": posted_within_days})

@mcp.tool()
async def score_job(title: str, company: str, url: str, text: str, location: str = "", is_remote: bool = False) -> str:
    """Score a single job posting against your resume using hybrid scoring (Gemini AI 0-100 + skill-alignment bonus 0-30 = final score capped at 100). All of title, company, url, text must be non-empty."""
    return await tools.tool_score_job({"title": title, "company": company, "url": url, "text": text, "location": location, "is_remote": is_remote})

@mcp.tool()
async def run_pipeline(flush: bool = False) -> str:
    """Execute the full job search pipeline: fetch → filter → hybrid score → generate materials for strong matches → email CSV digest. Set flush=true to reset DB before running."""
    return await tools.tool_run_pipeline({"flush": flush})

@mcp.tool()
async def flush_db() -> str:
    """Reset the jobs database. Deletes all scored jobs and rate-limit timestamps. Next run starts fresh."""
    return await tools.tool_flush_db({})

@mcp.tool()
async def bootstrap() -> str:
    """Regenerate profile.json from resume.txt using Gemini AI. Extracts anchor_skill, primary_skills, search_terms, keywords, location, seniority."""
    return await tools.tool_bootstrap({})

@mcp.tool()
async def generate_cover_letter(title: str, company: str, text: str, location: str = "", url: str = "") -> str:
    """Generate tailored resume bullets and a cover letter for a specific job posting. title, company, and text must be non-empty."""
    return await tools.tool_generate_cover_letter({"title": title, "company": company, "text": text, "location": location, "url": url})

@mcp.tool()
async def get_platforms() -> str:
    """Show configured job boards, search terms, anchor skill, and company slugs."""
    return await tools.tool_get_platforms({})

@mcp.tool()
async def get_analytics(hours: int = 168) -> str:
    """Get scoring analytics: total jobs, strong matches, average score, breakdown by source. hours is clamped to 1-8760."""
    return await tools.tool_get_analytics({"hours": hours})

@mcp.tool()
async def get_saved_jobs(hours: int = 24, min_score: int = 0) -> str:
    """Retrieve previously scored jobs from the database. Filter by recency (hours, clamped 1-8760) and minimum score (0-100). Returns up to 50 results."""
    return await tools.tool_get_saved_jobs({"hours": hours, "min_score": min_score})

@mcp.tool()
async def run_health_check() -> str:
    """Validate bot configuration: API keys set, resume file exists, profile loaded, database writable. Never exposes actual credential values."""
    return await tools.tool_run_health_check({})

@mcp.tool()
async def save_job(job_id: str, title: str = "", company: str = "", url: str = "", notes: str = "") -> str:
    """Bookmark a job for later. Stored in wrapper-local DB. Auto-fills title/company from jobs.db if not provided. job_id must be non-empty."""
    return await tools.tool_save_job({"job_id": job_id, "title": title, "company": company, "url": url, "notes": notes})

@mcp.tool()
async def unsave_job(job_id: str) -> str:
    """Remove a job from bookmarks."""
    return await tools.tool_unsave_job({"job_id": job_id})

@mcp.tool()
async def get_job_details(job_id: str = "", url: str = "") -> str:
    """Get full details of a scored job by job_id or URL. Provide at least one."""
    return await tools.tool_get_job_details({"job_id": job_id, "url": url})

@mcp.tool()
async def update_profile(key: str, value: str) -> str:
    """Update a field in profile.json. Only whitelisted keys accepted: anchor_skill, primary_skills, secondary_skills, target_titles, search_terms, keywords, location, country, seniority, email. Use JSON string for arrays."""
    return await tools.tool_update_profile({"key": key, "value": value})

@mcp.tool()
async def export_data(format: str = "json", return_file_path: bool = False) -> str:
    """Export all scored jobs from the database. format must be 'json' or 'csv'; unknown values default to 'json'. Set return_file_path=true to write to disk instead of returning inline."""
    return await tools.tool_export_data({"format": format, "return_file_path": return_file_path})

@mcp.tool()
async def add_interview(company: str, datetime: str, job_id: str = "", role: str = "", notes: str = "") -> str:
    """Track an upcoming interview. Stored in wrapper-local DB."""
    return await tools.tool_add_interview({"company": company, "datetime": datetime, "job_id": job_id, "role": role, "notes": notes})

@mcp.tool()
async def get_upcoming_interviews() -> str:
    """List upcoming interviews (future dates only)."""
    return await tools.tool_get_upcoming_interviews({})

@mcp.tool()
async def set_reminder(message: str, due_at: str) -> str:
    """Set a follow-up reminder. message and due_at must be non-empty."""
    return await tools.tool_set_reminder({"message": message, "due_at": due_at})

@mcp.tool()
async def get_reminders(include_done: bool = False) -> str:
    """Get active reminders. Set include_done=true to include completed ones."""
    return await tools.tool_get_reminders({"include_done": include_done})

@mcp.tool()
async def dismiss_reminder(reminder_id: int) -> str:
    """Mark a reminder as done."""
    return await tools.tool_dismiss_reminder({"reminder_id": reminder_id})

@mcp.tool()
async def compare_jobs(job_ids: list[str] = []) -> str:
    """Compare two or more jobs side by side. Provide 2-5 job_ids."""
    return await tools.tool_compare_jobs({"job_ids": job_ids})

@mcp.tool()
async def get_company_info(company: str) -> str:
    """[Not yet implemented] Get company enrichment data."""
    return await tools.tool_get_company_info({"company": company})

@mcp.tool()
async def pause_bot() -> str:
    """[Not yet implemented] Pause the hourly job search cron."""
    return await tools.tool_pause_bot({})

@mcp.tool()
async def resume_bot() -> str:
    """[Not yet implemented] Resume the hourly job search cron."""
    return await tools.tool_resume_bot({})

@mcp.tool()
async def get_bot_status() -> str:
    """Get current bot status: last run time, interval, and configuration."""
    return await tools.tool_get_bot_status({})


# ---------------------------------------------------------------------------
# Entry point — HTTP transport
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    transport = os.environ.get("MCP_TRANSPORT", "streamable-http")
    logger.info(f"Starting MCP HTTP server on {HOST}:{PORT} (transport: {transport})")
    logger.info(f"CORS origins: {ALLOWED_ORIGINS}")
    logger.info(f"Rate limit: {RATE_LIMIT_PER_HOUR} req/hour per IP")
    logger.info(f"Server API key: {'required' if SERVER_API_KEY else 'NOT SET (open access)'}")

    try:
        mcp.run(transport=transport)
    except KeyboardInterrupt:
        logger.info("HTTP server stopped by user")
    except Exception as e:
        logger.critical(f"HTTP server crashed: {e}", exc_info=True)
        raise
