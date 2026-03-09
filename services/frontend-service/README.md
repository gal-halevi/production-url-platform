# frontend-service

React + Vite SPA served by nginx. Provides two pages: shorten a URL and view redirect stats.

---

## Pages

- `/` — **Shorten**: submit a long URL, receive a short code and a copyable redirect link
- `/stats` — **Stats**: look up the redirect count for a given short code

---

## Runtime environment injection

The image is built once and configured per-environment at container startup — no rebuild required.

`docker-entrypoint.sh` uses `sed` to replace placeholder values in the compiled `index.html` before nginx starts:

```html
<script>
  window.__ENV__ = {
    API_URL:       "__API_URL_PLACEHOLDER__",
    ANALYTICS_URL: "__ANALYTICS_URL_PLACEHOLDER__",
    APP_ENV:       "__APP_ENV_PLACEHOLDER__"
  };
</script>
```

The React app reads from `window.__ENV__` at runtime. In production, `API_URL` and `ANALYTICS_URL` are set to the full external service URLs via Helm values. In local dev (Docker Compose), they are left empty and nginx proxies `/api/urls` → `url-service` and `/api/stats` → `analytics-service` instead.

`APP_ENV` drives the environment label shown in the footer (`DEV` / `STG` / `PROD`).

---

## Configuration (environment variables)

| Variable | Default | Description |
|---|---|---|
| `API_URL` | `""` | Full URL of url-service (e.g. `https://api.dev.example.com`). Empty = nginx proxy used |
| `ANALYTICS_URL` | `""` | Full URL of analytics-service (e.g. `https://analytics.dev.example.com`). Empty = nginx proxy used |
| `APP_ENV` | `unknown` | Environment name shown in footer |
| `VERSION` | `unknown` | Image tag, written into `/health` response at startup |
| `COMMIT` | `unknown` | Git SHA, written into `/health` response at startup |

---

## Run locally

For a full local stack (recommended):

```bash
docker compose up --build
```

The app is available at `http://localhost:5173`. nginx proxies API calls to the other services — no `API_URL` or `ANALYTICS_URL` needed.

To run the frontend in isolation with Vite's dev server:

```bash
cd services/frontend-service
npm install
npm run dev
```

Note: API calls will fail without the backend services running. Use Docker Compose for end-to-end local testing.

---

## Run tests

```bash
cd services/frontend-service
npm install
npm test
```
