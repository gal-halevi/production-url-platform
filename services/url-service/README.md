# url-service

Creates and resolves short URLs.

The service exposes health and readiness endpoints and supports both
in-memory and PostgreSQL-backed storage.

---

## Endpoints

- `GET /health`  
  Returns service health **and build/runtime metadata**:
  - service name
  - version
  - git commit SHA
  - environment (`APP_ENV`)
  - start timestamp

- `GET /ready`  
  Readiness probe. Verifies storage connectivity (including PostgreSQL).

- `POST /urls`  
  Create a short URL  
  Body:
  ```json
  { "long_url": "https://example.com" }
  ```

- `GET /urls/:code`  
  Resolve a short code to its original URL.

---

## Configuration (environment variables)

### Core
- `PORT` (default: `3000`)
- `HOST` (default: `0.0.0.0`)
- `BASE_URL` (e.g. `https://r.dev.url-platform.local`)
- `APP_ENV` (e.g. `dev`, `stg`, `prod`)

### Storage
- `STORAGE_MODE`: `memory | postgres`  
  Defaults to `postgres` if `DATABASE_URL` is set, otherwise `memory`
- `DATABASE_URL` (required for postgres mode)

### Runtime
- `LOG_LEVEL` (default: `info`)
- `BODY_LIMIT_BYTES` (default: `16384`)

### Rate limiting
- `RATE_LIMIT_ENABLED` (default: `true`)
- `RATE_LIMIT_MAX` (default: `60`)
- `RATE_LIMIT_WINDOW_MS` (default: `60000`)

---

## Health metadata

The `/health` endpoint exposes build and runtime metadata injected at build
and deploy time:

```json
{
  "status": "ok",
  "service": "url-service",
  "version": "sha-01e0766",
  "commit": "01e0766",
  "env": "dev",
  "started_at": "2026-02-01T08:41:12.123Z"
}
```

This is useful for:
- validating promotions across environments
- debugging rollouts
- confirming exactly which build is running

---

## Run locally (memory mode)

Build:
```bash
docker build -t url-service:dev services/url-service
```

Run:
```bash
docker run --rm \
  -e PORT=3000 \
  -e BASE_URL=http://localhost:3000 \
  -e APP_ENV=local \
  -p 3000:3000 \
  url-service:dev
```
