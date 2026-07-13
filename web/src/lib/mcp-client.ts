/**
 * MCP HTTP Client — handles session management and tool calls.
 * Manages the Streamable HTTP protocol (initialize → notification → tool call).
 */

const MCP_BASE_URL = process.env.NEXT_PUBLIC_MCP_URL || "http://localhost:8000/mcp";

interface MCPSession {
  sessionId: string;
  initialized: boolean;
}

let currentSession: MCPSession | null = null;

function parseSSE(text: string): any {
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      return JSON.parse(line.slice(6));
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: "Failed to parse response", raw: text };
  }
}

async function initSession(keys: { gemini?: string; apify?: string }): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (keys.gemini) headers["X-Gemini-Key"] = keys.gemini;
  if (keys.apify) headers["X-Apify-Key"] = keys.apify;

  const resp = await fetch(MCP_BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "job-search-web", version: "1.0.0" },
      },
    }),
  });

  const sessionId = resp.headers.get("mcp-session-id") || "";

  // Send initialized notification
  await fetch(MCP_BASE_URL, {
    method: "POST",
    headers: { ...headers, "mcp-session-id": sessionId },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  currentSession = { sessionId, initialized: true };
  return sessionId;
}

export async function callTool(
  toolName: string,
  args: Record<string, any>,
  keys: { gemini?: string; apify?: string } = {}
): Promise<any> {
  // Initialize session if needed
  if (!currentSession?.initialized) {
    await initSession(keys);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "mcp-session-id": currentSession!.sessionId,
  };
  if (keys.gemini) headers["X-Gemini-Key"] = keys.gemini;
  if (keys.apify) headers["X-Apify-Key"] = keys.apify;

  const resp = await fetch(MCP_BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  const data = parseSSE(await resp.text());

  if (data.result?.content?.[0]?.text) {
    return JSON.parse(data.result.content[0].text);
  }
  if (data.error) {
    throw new Error(data.error.message || "MCP call failed");
  }
  return data;
}

export function resetSession() {
  currentSession = null;
}
