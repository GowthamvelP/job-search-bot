# Changelog

## [1.0.0-mcp] - 2026-07-09

### Added
- Initial MCP server release with 25 tools
- 15 live tools across Search & Score, Monitor, Track & Configure categories
- 5 wrapper-local tools with dedicated SQLite storage (bookmarks, interviews, reminders)
- Security audit: whitelisted profile keys, parameterized SQL, input clamping, credential masking
- Full tool reference documentation (TOOLS.md)
- Security documentation (SECURITY.md)
- Server crash logging to server.log
- Gemini model cascade (8 models, ~3,000+ free calls/day)
- Hybrid scoring: Gemini AI (0-100) + deterministic skill-alignment bonus (0-30)
- Resume-driven bootstrap: extracts anchor_skill, search_terms, keywords from resume.txt

### Architecture
- FastMCP (mcp SDK v1.28+) with typed @mcp.tool() decorators
- stdio transport (local-only, no network)
- Wrapper-local storage in wrapper.db (separate from bot's jobs.db)
- Bot code (bot/) completely untouched — wrapper is a pure protocol adapter

### Design Principles
- Never auto-apply — bot surfaces information, human decides
- No credential exposure — health check reports set/MISSING, never actual values
- Input validation at every boundary
- Graceful quota handling — cascades through models, stops cleanly when exhausted
