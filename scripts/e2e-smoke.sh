#!/usr/bin/env bash
set -euo pipefail

BASE_URL_SERVICE="${BASE_URL_SERVICE:-http://localhost:3000}"
BASE_REDIRECT_SERVICE="${BASE_REDIRECT_SERVICE:-http://localhost:8080}"
BASE_ANALYTICS_SERVICE="${BASE_ANALYTICS_SERVICE:-http://localhost:8000}"

wait_http() {
  local url="$1"
  local attempts="${2:-60}"
  local sleep_s="${3:-0.5}"

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$sleep_s"
  done
  echo "timeout waiting for $url" >&2
  return 1
}

echo "Waiting for services..."
wait_http "${BASE_URL_SERVICE}/ready"
wait_http "${BASE_REDIRECT_SERVICE}/ready"
wait_http "${BASE_ANALYTICS_SERVICE}/ready"

echo "Creating short URL..."
create_resp="$(curl -fsS -X POST "${BASE_URL_SERVICE}/urls" \
  -H 'content-type: application/json' \
  -d '{"long_url":"https://example.com"}')"

code="$(printf '%s' "$create_resp" | python3 -c 'import json,sys; print(json.load(sys.stdin)["code"])')"
if [[ -z "$code" ]]; then
  echo "failed to parse code from response: $create_resp" >&2
  exit 1
fi
echo "code=$code"

echo "Checking redirect..."
location="$(curl -sSI "${BASE_REDIRECT_SERVICE}/r/${code}" | awk -F': ' 'tolower($1)=="location"{print $2}' | tr -d '\r')"
if [[ "$location" != "https://example.com" ]]; then
  echo "unexpected Location: '$location'" >&2
  exit 1
fi

echo "Checking analytics (may be async)..."
ok=0
for _ in $(seq 1 25); do
  count="$(curl -fsS "${BASE_ANALYTICS_SERVICE}/stats/${code}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("count",0))')"
  if [[ "${count}" -ge 1 ]]; then
    ok=1
    break
  fi
  sleep 0.2
done

if [[ "$ok" -ne 1 ]]; then
  echo "analytics did not increment for code=$code" >&2
  curl -sS "${BASE_ANALYTICS_SERVICE}/stats/${code}" || true
  exit 1
fi

echo "E2E smoke passed ✅"
