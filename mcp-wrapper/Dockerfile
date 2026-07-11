FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY bot/requirements.txt ./bot/requirements.txt
RUN pip install --no-cache-dir -r bot/requirements.txt
RUN pip install --no-cache-dir mcp httpx

# Copy bot and wrapper code
COPY bot/ ./bot/
COPY mcp-wrapper/ ./mcp-wrapper/

# Port (Fly.io assigns via $PORT env var, default 8000)
EXPOSE 8000

# Run the HTTP transport server
CMD ["python", "mcp-wrapper/http_server.py"]
