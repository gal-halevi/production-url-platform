# url-service

Creates and resolves short URLs.

## Endpoints
- GET /health
- GET /ready
- POST /urls  (body: { "long_url": "https://example.com" })
- GET /urls/:code

## Config (env)
- PORT (default 3000)
- HOST (default 0.0.0.0)
- BASE_URL (default http://localhost:3000)
- STORAGE_MODE: memory | postgres (default: postgres if DATABASE_URL is set, else memory)
- DATABASE_URL (required for postgres mode)
- LOG_LEVEL (default info)
- BODY_LIMIT_BYTES (default 16384)
- RATE_LIMIT_ENABLED (default true)
- RATE_LIMIT_MAX (default 60)
- RATE_LIMIT_WINDOW_MS (default 60000)

## Run (memory mode)
Build:
- docker build -t url-service:dev services/url-service

Run:
- docker run --rm -e PORT=3000 -e BASE_URL=http://localhost:3000 -p 3000:3000 url-service:dev