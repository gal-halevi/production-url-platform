# redirect-service

Handles short URL redirects and emits analytics events.

When a request arrives for `/r/{code}`, the service resolves the original URL from url-service, issues an HTTP 302 redirect, and asynchronously enqueues an analytics event to analytics-service. The analytics emit is fire-and-forget — redirect latency is never blocked on it.

---

## Endpoints

- `GET /health`  
  Returns service health:
  ```json
  { "status": "ok", "service": "redirect-service" }
  ```

- `GET /ready`  
  Readiness probe. Always returns `200` when the process is up (no external dependencies checked here — url-service connectivity is validated at redirect time).

- `GET /metrics`  
  Exposes Prometheus-compatible metrics in text format.

  Metrics include:
  - `http_requests_total` — total HTTP requests by method, route template, and status code
  - `http_request_duration_seconds` — request latency histogram

  Route labels are normalized to low-cardinality templates (e.g. `/r/{code}`) to prevent cardinality explosion from arbitrary short codes. Any unrecognized path is collapsed to `unknown`.

  ⚠️ Intended for **internal cluster scraping only** (Prometheus). Not exposed publicly via ingress.

- `GET /r/{code}`  
  Resolves `code` via url-service and issues an HTTP 302 redirect to the original URL.  
  Also accepts `HEAD` requests.  
  Returns `404` if the code is not found, `502` if url-service is unreachable.

---

## Observability

The service is instrumented with Prometheus metrics via a middleware wrapper applied to all routes. The `/metrics` endpoint is registered directly on the mux to bypass the metrics middleware and avoid self-recording scrape requests.

Structured logging is supported via `LOG_JSON=true`, emitting JSON log lines to stdout. All log lines include a `request_id` field for cross-service correlation.

Metrics are scraped by Prometheus via a `ServiceMonitor` in Kubernetes.

---

## Analytics event delivery

Analytics events are delivered asynchronously via an in-process bounded queue (default size: 256 events). A background goroutine drains the queue and posts events to analytics-service with a configurable timeout.

If the queue is full, the event is dropped and a log line is emitted. This design ensures that analytics-service unavailability or slowness never impacts redirect latency.

---

## Configuration (environment variables)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Listening port |
| `HOST` | `0.0.0.0` | Listening address |
| `LOG_JSON` | `false` | Emit structured JSON logs |
| `URL_SERVICE_BASE_URL` | `http://url-service:3000` | Base URL for url-service resolve calls |
| `ANALYTICS_SERVICE_BASE_URL` | `http://analytics-service:8000` | Base URL for analytics event delivery |
| `ANALYTICS_TIMEOUT_MS` | `300` | Timeout for analytics POST requests (ms) |
| `ANALYTICS_QUEUE_SIZE` | `256` | Bounded queue depth for async analytics events |

---

## Run locally

Build:
```bash
docker build -t redirect-service:dev services/redirect-service
```

Run:
```bash
docker run --rm \
  -e PORT=8080 \
  -e URL_SERVICE_BASE_URL=http://host.docker.internal:3000 \
  -e ANALYTICS_SERVICE_BASE_URL=http://host.docker.internal:8000 \
  -p 8080:8080 \
  redirect-service:dev
```

Health check:
```bash
curl http://localhost:8080/health
```

Redirect (requires url-service running with a known code):
```bash
curl -i http://localhost:8080/r/<code>
```

For a complete local stack, use Docker Compose from the repo root:
```bash
docker compose up --build
```
