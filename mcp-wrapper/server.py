# mcp-wrapper/server.py
#
# Rationale: Same-repo today — this MCP server is a thin translation layer that
# exposes the bot's existing functions as MCP tools. No bot logic is duplicated here.
# If this wrapper matures into a standalone project, it will be moved to its own repo.

"""
MCP Server for job-search-bot.

Exposes the bot's pipeline stages as individual MCP tools that AI agents
(Claude, Kiro, etc.) can invoke directly:
  - search_jobs: fetch and filter jobs from all sources
  - score_job: score a single job against the resume
  - run_pipeline: execute the full fetch → score → email pipeline
  - flush_db: reset the database for fresh scoring
  - bootstrap: regenerate profile.json from resume
"""

import sys
import os

# Add parent dir so we can import the bot package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp.server import Server
from mcp.server.stdio import run_stdio
from mcp.types import Tool, TextContent

from tools import (
    tool_search_jobs,
    tool_score_job,
    tool_run_pipeline,
    tool_flush_db,
    tool_bootstrap,
    TOOL_DEFINITIONS,
)


app = Server("job-search-bot")


@app.list_tools()
async def list_tools() -> list[Tool]:
    """Return all available MCP tools."""
    return TOOL_DEFINITIONS


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Dispatch tool calls to the appropriate handler."""
    handlers = {
        "search_jobs": tool_search_jobs,
        "score_job": tool_score_job,
        "run_pipeline": tool_run_pipeline,
        "flush_db": tool_flush_db,
        "bootstrap": tool_bootstrap,
    }

    handler = handlers.get(name)
    if not handler:
        return [TextContent(type="text", text=f"Unknown tool: {name}")]

    result = await handler(arguments)
    return [TextContent(type="text", text=result)]


def main():
    """Entry point for the MCP server."""
    import asyncio
    asyncio.run(run_stdio(app))


if __name__ == "__main__":
    main()
