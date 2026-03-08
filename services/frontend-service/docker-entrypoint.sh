#!/bin/sh
set -eu

# Inject runtime environment variables into index.html.
# This allows the container image to be built once and configured per-environment
# without a rebuild — API_URL is set via Helm values / Kubernetes env var.
API_URL="${API_URL:-}"
ANALYTICS_URL="${ANALYTICS_URL:-}"
VERSION="${VERSION:-unknown}"
COMMIT="${COMMIT:-unknown}"
APP_ENV="${APP_ENV:-unknown}"

sed -i "s|__API_URL_PLACEHOLDER__|${API_URL}|g" \
    /usr/share/nginx/html/index.html

sed -i "s|__ANALYTICS_URL_PLACEHOLDER__|${ANALYTICS_URL}|g" \
    /usr/share/nginx/html/index.html

sed -i "s|__APP_ENV_PLACEHOLDER__|${APP_ENV}|g" \
    /usr/share/nginx/html/index.html

# Write the /health response file at startup so nginx can serve it statically.
# VERSION, COMMIT, and APP_ENV are injected via Helm ConfigMap / docker-compose env.
cat > /usr/share/nginx/html/health.json << HEALTH
{"status":"ok","service":"frontend-service","version":"${VERSION}","commit":"${COMMIT}","env":"${APP_ENV}"}
HEALTH

exec nginx -g "daemon off;"
