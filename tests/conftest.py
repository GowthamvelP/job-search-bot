"""Shared fixtures for MCP server tests."""
import pytest
import httpx
import json
import os
import sys
import tempfile

# Add project paths
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mcp-wrapper"))

BASE_URL = "http://localhost:8000/mcp"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}


def parse_sse(text: str) -> dict:
    """Parse SSE response to extract JSON data."""
    for line in text.split("\n"):
        if line.startswith("data: "):
            return json.loads(line[6:])
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw": text}


@pytest.fixture
def mcp_session():
    """Create an initialized MCP session. Returns (session_id, headers_with_session)."""
    # Initialize
    resp = httpx.post(BASE_URL, headers=HEADERS, json={
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "pytest", "version": "1.0"}}
    }, timeout=15)
    session_id = resp.headers.get("mcp-session-id", "")

    # Send initialized notification
    sess_headers = {**HEADERS, "mcp-session-id": session_id}
    httpx.post(BASE_URL, headers=sess_headers, json={
        "jsonrpc": "2.0", "method": "notifications/initialized"
    }, timeout=5)

    return session_id, sess_headers


def call_tool(session_headers: dict, tool_name: str, arguments: dict = None, timeout: float = 30) -> dict:
    """Call an MCP tool and return the parsed result."""
    resp = httpx.post(BASE_URL, headers=session_headers, json={
        "jsonrpc": "2.0", "id": 99, "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments or {}}
    }, timeout=timeout)
    data = parse_sse(resp.text)
    if "result" in data and data["result"].get("content"):
        return json.loads(data["result"]["content"][0]["text"])
    if "error" in data:
        return {"_rpc_error": data["error"]}
    return data


@pytest.fixture
def call(mcp_session):
    """Fixture that returns a function to call MCP tools with an active session."""
    _, headers = mcp_session
    def _call(tool_name: str, arguments: dict = None) -> dict:
        return call_tool(headers, tool_name, arguments)
    return _call


@pytest.fixture
def temp_db():
    """Create a temporary database file, cleaned up after test."""
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    yield tmp.name
    os.unlink(tmp.name)
