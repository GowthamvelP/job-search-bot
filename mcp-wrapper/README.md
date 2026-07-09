# MCP Wrapper for job-search-bot

A [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes the job-search-bot pipeline as tools for AI agents (Claude, Kiro, etc.).

> **Note:** If this wrapper matures into a standalone project, it will be moved to its own repository.

## Tools exposed

| Tool | Description |
|------|-------------|
| `search_jobs` | Fetch and filter jobs from Apify (LinkedIn, Indeed, Glassdoor, Naukri) + Greenhouse/Lever |
| `score_job` | Score a single job using hybrid scoring (Gemini AI + skill-alignment bonus) |
| `run_pipeline` | Execute the full pipeline: fetch → score → email CSV digest |
| `flush_db` | Reset the database for fresh scoring |
| `bootstrap` | Regenerate `profile.json` from `resume.txt` |

## Setup

### Prerequisites

- Python 3.11+
- The bot configured and working (see [root README](../README.md))
- API keys set in `.env` at the project root

### Install

```bash
cd mcp-wrapper
pip install -e .
```

Or from the project root:

```bash
pip install -e "./mcp-wrapper"
```

### Configure in your MCP client

Add to your MCP config (e.g., `.kiro/settings/mcp.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "job-search": {
      "command": "python",
      "args": ["mcp-wrapper/server.py"],
      "cwd": "/path/to/job-search-bot",
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

Or if you installed via pip:

```json
{
  "mcpServers": {
    "job-search": {
      "command": "job-search-mcp"
    }
  }
}
```

## Usage examples

Once connected, your AI agent can:

- "Search for Ruby on Rails jobs posted in the last 3 days"
- "Score this job posting against my resume: [paste URL and description]"
- "Run the full job search pipeline and send me an email"
- "Flush the database and re-score everything"
- "Regenerate my profile from my updated resume"

## Architecture

```
AI Agent (Claude / Kiro)
    │
    ▼ MCP Protocol (stdio)
┌─────────────────────┐
│  mcp-wrapper/       │
│  server.py          │ ← thin translation layer
│  tools.py           │ ← argument parsing + result formatting
└─────────────────────┘
    │
    ▼ direct function calls
┌─────────────────────┐
│  bot/               │
│  main.py            │ ← orchestrator
│  discovery.py       │ ← job fetching
│  db.py              │ ← persistence
│  config.py          │ ← settings
└─────────────────────┘
```

No bot logic is duplicated in the wrapper. It's purely a protocol adapter.
