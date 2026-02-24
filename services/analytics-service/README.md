# analytics-service

Ingests redirect events and exposes aggregated statistics.

Redirect events are POSTed by redirect-service after each successful redirect. The service uses an upsert pattern — each event increments the redirect count for a given short code atomically, with no race condition between check and insert.

---

## Endpoints

- `GET /health`  
  Returns service health:
  ```json
  { "status": "ok", "service": "analytics-service" }
  ```

- `GET /ready`  
  Readiness probe. Verifies PostgreSQL connectivity. Returns `503` if the database is unreachable.

- `GET /metrics`  
  Exposes Prometheus-compatible metrics in text format via `prometheus-fastapi-instrumentator`.

  Metrics include per-route request counts and latency histograms.

  ⚠️ Intended for **internal cluster scraping only** (Prometheus). Not exposed publicly via ingress.

- `POST /events`  
  Ingest a redirect event. Increments the redirect count for the given code.  
  Returns `202 Accepted` on success.

  Body:
  ```json
  {
    "code": "abc123",
    "ts": 1700000000,
    "user_agent": "Mozilla/5.0 ...",
    "referrer": "https://example.com"
  }
  ```
  `ts`, `user_agent`, and `referrer` are optional.

- `GET /stats`  
  Returns the top 20 most-redirected codes plus total tracked code count and service uptime.

  ```json
  {
    "uptime_seconds": 3600,
    "tracked_codes": 42,
    "top": [
      { "code": "abc123", "count": 17 },
      { "code": "xyz789", "count": 4 }
    ]
  }
  ```

- `GET /stats/{code}`  
  Returns the redirect count for a specific short code. Returns `0` if the code has no recorded events.

  ```json
  { "code": "abc123", "count": 17 }
  ```

---

## Observability

The service uses `prometheus-fastapi-instrumentator` for automatic per-route metrics instrumentation. All log lines include a `request_id` field for cross-service correlation, propagated via the `X-Request-ID` header.

Structured log output is written to stdout. Log level is configurable via `LOG_LEVEL`.

Metrics are scraped by Prometheus via a `ServiceMonitor` in Kubernetes.

---

## Database

The service owns the `url_platform_analytics` PostgreSQL database exclusively. No other service reads from or writes to this database.

Schema migrations are managed by **Flyway**, running as a Kubernetes Job at ArgoCD sync wave 2 before the analytics-service Deployment starts at wave 3. Migration files live in `migrations/` (source of truth) with a chart-side copy in `charts/url-platform/migrations/analytics/`.

---

## Configuration (environment variables)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | Listening port |
| `HOST` | `0.0.0.0` | Listening address |
| `LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warning`, `error`) |
| `BODY_LIMIT_BYTES` | `16384` | Maximum request body size (bytes) |
| `DATABASE_URL` | — | PostgreSQL connection string (required). Injected from Kubernetes Secret (`postgres-secret`, key `DATABASE_URL_ANALYTICS`) |

---

## Run locally

Requires a running PostgreSQL instance with the `url_platform_analytics` database and schema applied.

Install dependencies:
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Run:
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/url_platform_analytics \
  python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Run in Docker:
```bash
docker build -t analytics-service:dev services/analytics-service
docker run --rm \
  -e DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/url_platform_analytics \
  -p 8000:8000 \
  analytics-service:dev
```

For a complete local stack with PostgreSQL and all services, use Docker Compose from the repo root:
```bash
docker compose up --build
```
