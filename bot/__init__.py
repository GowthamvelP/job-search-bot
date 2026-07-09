# job-search-bot/bot/__init__.py
#
# Rationale: Same-repo monorepo structure. The bot lives here as a package so the
# MCP wrapper (and future interfaces like Discord/Slack) can import its functions
# directly without duplicating logic.
#
# The bot files use flat imports (e.g., `from config import ...`). To support both
# standalone execution (`cd bot && python main.py`) and package import (`from bot import ...`),
# we add the bot directory to sys.path when this package is imported.
#
# If the wrapper matures into a standalone project, it will be moved to its own repository.

import sys
import os

# Add bot/ to sys.path so flat imports within bot files resolve correctly
_bot_dir = os.path.dirname(os.path.abspath(__file__))
if _bot_dir not in sys.path:
    sys.path.insert(0, _bot_dir)
