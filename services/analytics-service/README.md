# analytics-service

Accepts redirect events and exposes basic aggregated stats.

## Endpoints
- GET /health
- GET /ready
- POST /events
- GET /stats
- GET /stats/{code}

## Config (env)
- PORT (default 8000)
- HOST (default 0.0.0.0)
- LOG_LEVEL (default info)
- BODY_LIMIT_BYTES (default 16384)

## Run locally
```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Run in Docker
```bash
docker build -t analytics-service:dev services/analytics-service
docker run --rm -p 8000:8000 analytics-service:dev
```
