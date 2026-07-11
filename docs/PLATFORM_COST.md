# Deployment Platform Comparison

## For the MCP HTTP Server (single process, Python 3.11, ~100MB RAM)

| Platform | Free Tier | Persistent VM | Min Paid | Region Options |
|----------|-----------|---------------|----------|----------------|
| **Fly.io** | 3 VMs, 3GB RAM, 160GB bandwidth | ✅ Yes | $1.94/mo | 30+ regions (incl. Mumbai `bom`) |
| Railway | $5 trial credit only | ✅ Yes | $5/mo | US/EU only |
| Render | Sleeps after 15min inactivity | ❌ No (free) | $7/mo | US only |
| Vercel (serverless) | Generous | ❌ No (cold starts) | $20/mo | Edge |

## Why Fly.io for this project

1. **$0 cost** — free tier covers validation phase entirely
2. **No cold starts** — VM stays running, MCP connections stay alive
3. **Mumbai region** — low latency for India-based users
4. **Docker-native** — one Dockerfile, one `fly deploy`
5. **Secret management** — `fly secrets set KEY=val` (encrypted, not in repo)

## Estimated monthly cost at scale

| Users | Fly.io | Railway |
|-------|--------|---------|
| 1–10 (validation) | $0 | $5 |
| 10–100 | $1.94 | $5–20 |
| 100–1000 | $5–15 | $20–50 |

## Current choice: Fly.io (Mumbai region)

- App name: `jobagent-http`
- Region: `bom` (Mumbai)
- VM: `shared-cpu-1x`, 256MB RAM
- URL: `https://jobagent-http.fly.dev`
