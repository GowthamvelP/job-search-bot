# mcp-wrapper/server.py
#
# MCP server for job-search-bot. Thin protocol adapter — no bot logic here.
# Exposes 25 tools across 3 tiers: real (10), wrapper-local (5), stubs (10).

import sys
import os
import json

# Add parent dir so we can import the bot package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Add mcp-wrapper dir so we can import tools and storage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mcp.server import Server
from mcp.server.stdio import run_stdio
from mcp.types import Tool, TextContent

import tools

app = Server("job-search-bot")


# ---------------------------------------------------------------------------
# Tool definitions — full schema for each tool
# ---------------------------------------------------------------------------

TOOL_REGISTRY = [
    # --- TIER 1: Real tools ---
    Tool(name="search_jobs", description="Fetch and filter job postings from all configured sources (Apify: LinkedIn, Indeed, Glassdoor, Naukri + Greenhouse/Lever). Returns filtered, sorted jobs. Does NOT score them.", inputSchema={
        "type": "object", "properties": {"posted_within_days": {"type": "integer", "description": "Only include jobs posted in the last N days (default: 7)"}}, "required": []}),

    Tool(name="score_job", description="Score a single job posting against your resume using hybrid scoring (Gemini AI 0-100 + skill-alignment bonus 0-30 = final score capped at 100).", inputSchema={
        "type": "object", "properties": {"title": {"type": "string"}, "company": {"type": "string"}, "location": {"type": "string"}, "url": {"type": "string"}, "text": {"type": "string", "description": "Full job description"}, "is_remote": {"type": "boolean"}}, "required": ["title", "company", "url", "text"]}),

    Tool(name="run_pipeline", description="Execute the full job search pipeline: fetch → filter → hybrid score → generate materials for strong matches → email CSV digest.", inputSchema={
        "type": "object", "properties": {"flush": {"type": "boolean", "description": "Reset DB before running (default: false)"}}, "required": []}),

    Tool(name="flush_db", description="Reset the jobs database. Deletes all scored jobs and rate-limit timestamps. Next run starts fresh.", inputSchema={
        "type": "object", "properties": {}, "required": []}),

    Tool(name="bootstrap", description="Regenerate profile.json from resume.txt using Gemini AI. Extracts anchor_skill, primary_skills, search_terms, keywords, location, seniority.", inputSchema={
        "type": "object", "properties": {}, "required": []}),

    Tool(name="generate_cover_letter", description="Generate tailored resume bullets and a cover letter for a specific job posting.", inputSchema={
        "type": "object", "properties": {"title": {"type": "string"}, "company": {"type": "string"}, "location": {"type": "string"}, "url": {"type": "string"}, "text": {"type": "string", "description": "Full job description"}}, "required": ["title", "company", "text"]}),

    Tool(name="get_platforms", description="Show configured job boards, search terms, and company slugs.", inputSchema={
        "type": "object", "properties": {}, "required": []}),

    Tool(name="get_analytics", description="Get scoring analytics: total jobs, strong matches, average score, breakdown by source.", inputSchema={
        "type": "object", "properties": {"hours": {"type": "integer", "description": "Lookback period in hours (default: 168 = 7 days)"}}, "required": []}),

    Tool(name="get_saved_jobs", description="Retrieve previously scored jobs from the database. Filter by recency and minimum score.", inputSchema={
        "type": "object", "properties": {"hours": {"type": "integer", "description": "Lookback hours (default: 24)"}, "min_score": {"type": "integer", "description": "Minimum score filter (default: 0)"}}, "required": []}),

    Tool(name="run_health_check", description="Validate bot configuration: API keys, resume file, profile, database connectivity.", inputSchema={
        "type": "object", "properties": {}, "required": []}),

    # --- TIER 2: Wrapper-local tools ---
    Tool(name="save_job", description="Bookmark a job for later. Stored locally in the MCP wrapper database.", inputSchema={
        "type": "object", "properties": {"job_id": {"type": "string", "description": "Job ID from scoring results"}, "title": {"type": "string"}, "company": {"type": "string"}, "url": {"type": "string"}, "notes": {"type": "string"}}, "required": ["job_id"]}),

    Tool(name="unsave_job", description="Remove a job from bookmarks.", inputSchema={
        "type": "object", "properties": {"job_id": {"type": "string"}}, "required": ["job_id"]}),

    Tool(name="get_job_details", description="Get full details of a scored job by job_id or URL.", inputSchema={
        "type": "object", "properties": {"job_id": {"type": "string"}, "url": {"type": "string"}}, "required": []}),

    Tool(name="update_profile", description="Update a field in profile.json. Changes take effect on next pipeline run.", inputSchema={
        "type": "object", "properties": {"key": {"type": "string", "description": "Field name (e.g., anchor_skill, keywords, search_terms)"}, "value": {"type": "string", "description": "New value (use JSON string for arrays)"}}, "required": ["key", "value"]}),

    Tool(name="export_data", description="Export all scored jobs from the database as JSON or CSV.", inputSchema={
        "type": "object", "properties": {"format": {"type": "string", "enum": ["json", "csv"], "description": "Output format (default: json)"}}, "required": []}),

    # --- TIER 3: Stubs / partially implemented ---
    Tool(name="add_interview", description="Track an upcoming interview.", inputSchema={
        "type": "object", "properties": {"job_id": {"type": "string"}, "company": {"type": "string"}, "role": {"type": "string"}, "datetime": {"type": "string", "description": "ISO datetime"}, "notes": {"type": "string"}}, "required": ["company", "datetime"]}),

    Tool(name="get_upcoming_interviews", description="List upcoming interviews.", inputSchema={
        "type": "object", "properties": {}, "required": []}),

    Tool(name="set_reminder", description="Set a follow-up reminder.", inputSchema={
        "type": "object", "properties": {"message": {"type": "string"}, "due_at": {"type": "string", "description": "ISO date or datetime"}}, "required": ["message", "due_at"]}),

    Tool(name="get_reminders", description="Get active reminders.", inputSchema={
        "type": "object", "properties": {"include_done": {"type": "boolean", "description": "Include completed reminders (default: false)"}}, "required": []}),

    Tool(name="dismiss_reminder", description="Mark a reminder as done.", inputSchema={
        "type": "object", "properties": {"reminder_id": {"type": "integer"}}, "required": ["reminder_id"]}),

    Tool(name="compare_jobs", description="[Stub] Compare two or more jobs side by side. Not yet implemented.", inputSchema={
        "type": "object", "properties": {"job_ids": {"type": "array", "items": {"type": "string"}}}, "required": ["job_ids"]}),

    Tool(name="get_company_info", description="[Stub] Get company information. Not yet implemented.", inputSchema={
        "type": "object", "properties": {"company": {"type": "string"}}, "required": ["company"]}),

    Tool(name="pause_bot", description="[Stub] Pause the hourly job search. Not yet implemented.", inputSchema={
        "type": "object", "properties": {}, "required": []}),

    Tool(name="resume_bot", description="[Stub] Resume the hourly job search. Not yet implemented.", inputSchema={
        "type": "object", "properties": {}, "required": []}),

    Tool(name="get_bot_status", description="Get current bot status: last run time, interval, and configuration.", inputSchema={
        "type": "object", "properties": {}, "required": []}),
]


# ---------------------------------------------------------------------------
# Handler dispatch map
# ---------------------------------------------------------------------------

HANDLERS = {
    # Tier 1
    "search_jobs": tools.tool_search_jobs,
    "score_job": tools.tool_score_job,
    "run_pipeline": tools.tool_run_pipeline,
    "flush_db": tools.tool_flush_db,
    "bootstrap": tools.tool_bootstrap,
    "generate_cover_letter": tools.tool_generate_cover_letter,
    "get_platforms": tools.tool_get_platforms,
    "get_analytics": tools.tool_get_analytics,
    "get_saved_jobs": tools.tool_get_saved_jobs,
    "run_health_check": tools.tool_run_health_check,
    # Tier 2
    "save_job": tools.tool_save_job,
    "unsave_job": tools.tool_unsave_job,
    "get_job_details": tools.tool_get_job_details,
    "update_profile": tools.tool_update_profile,
    "export_data": tools.tool_export_data,
    # Tier 3
    "add_interview": tools.tool_add_interview,
    "get_upcoming_interviews": tools.tool_get_upcoming_interviews,
    "set_reminder": tools.tool_set_reminder,
    "get_reminders": tools.tool_get_reminders,
    "dismiss_reminder": tools.tool_dismiss_reminder,
    "compare_jobs": tools.tool_compare_jobs,
    "get_company_info": tools.tool_get_company_info,
    "pause_bot": tools.tool_pause_bot,
    "resume_bot": tools.tool_resume_bot,
    "get_bot_status": tools.tool_get_bot_status,
}


# ---------------------------------------------------------------------------
# MCP protocol handlers
# ---------------------------------------------------------------------------

@app.list_tools()
async def list_tools() -> list[Tool]:
    return TOOL_REGISTRY


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    handler = HANDLERS.get(name)
    if not handler:
        return [TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]

    try:
        result = await handler(arguments)
        return [TextContent(type="text", text=result)]
    except Exception as e:
        return [TextContent(type="text", text=json.dumps({"error": str(e), "tool": name}))]


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    import asyncio
    asyncio.run(run_stdio(app))


if __name__ == "__main__":
    main()
