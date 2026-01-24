# redirect-service

Handles redirects.

## Endpoints
- GET /health
- GET /ready
- GET /r/{code} (302 redirect)

## Config (env)
- PORT (default 8080)
- HOST (default 0.0.0.0)
- DEFAULT_REDIRECT_URL (default https://example.com)
- LOG_JSON (default false)

## Run locally
go run .

## Run in Docker
```bash
docker build -t redirect-service:dev services/redirect-service
docker run --rm -p 8080:8080 -e PORT=8080 redirect-service:dev
```
