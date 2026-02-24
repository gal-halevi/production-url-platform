# url-service

Creates and resolves short URLs.

The service exposes health and readiness endpoints and supports both in-memory and PostgreSQL-backed storage.

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
  Readiness probe. Verifies storage connectivity (including PostgreSQL ping).

- `GET /metrics`  
  Exposes Prometheus-compatible metrics in text format.

  Metrics include:
  - `http_requests_total` — total HTTP requests by method, route template, and status code
  - `http_request_duration_seconds` — request latency histogram

  ⚠️ Intended for **internal cluster scraping only** (Prometheus). Not exposed publicly via ingress.

- `POST /urls`  
  Create a short URL.  
  Body:
  ```json
  { "long_url": "https://example.com" }
  ```

- `GET /urls/:code`  
  Resolve a short code to its original URL.

---

## Observability

The service is instrumented with Prometheus metrics using Fastify lifecycle hooks.

Design goals:
- Low-cardinality labels (route templates, not raw URLs)
- Metrics emitted for all requests, including errors
- No application logic coupled to monitoring concerns

Metrics are scraped by Prometheus via a `ServiceMonitor` in Kubernetes.

---

## Health metadata

The `/health` endpoint exposes build and runtime metadata injected at build time and startup:

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

`version` and `commit` are injected as Docker build args (`APP_VERSION`, `GIT_SHA`) by CI. The smoke test workflow reads the expected tag from the gitops values file and verifies it matches the deployed version on every environment sync.

---

## Database

The service owns the `url_platform_urls` PostgreSQL database exclusively. No other service reads from or writes to this database.

Schema migrations are managed by **Flyway**, running as a Kubernetes Job at ArgoCD sync wave 2 before the url-service Deployment starts at wave 3. Migration files live in `migrations/` (source of truth) with a chart-side copy in `charts/url-platform/migrations/url-service/`.

---

## Configuration (environment variables)

### Core
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Listening port |
| `HOST` | `0.0.0.0` | Listening address |
| `BASE_URL` | — | Public base URL for generated short URLs (e.g. `https://r.dev.example.com`) |
| `APP_ENV` | — | Environment name, included in health response (`dev`, `stg`, `prod`) |

### Storage
| Variable | Default | Description |
|---|---|---|
| `STORAGE_MODE` | `postgres` if `DATABASE_URL` is set, else `memory` | Storage backend |
| `DATABASE_URL` | — | PostgreSQL connection string (required for postgres mode). Injected from Kubernetes Secret (`postgres-secret`, key `DATABASE_URL`) |

### Runtime
| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Log level |
| `BODY_LIMIT_BYTES` | `16384` | Maximum request body size (bytes) |

### Rate limiting
| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_ENABLED` | `true` | Enable per-IP rate limiting |
| `RATE_LIMIT_MAX` | `60` | Maximum requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |

### Build-time (injected by CI)
| Variable | Description |
|---|---|
| `APP_VERSION` | Immutable image tag (e.g. `sha-01e0766`) |
| `GIT_SHA` | Short commit SHA (e.g. `01e0766`) |

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

Metrics can be viewed locally at:
```bash
curl http://localhost:3000/metrics
```

For a complete local stack with PostgreSQL and all services, use Docker Compose from the repo root:
```bash
docker compose up --build
```
