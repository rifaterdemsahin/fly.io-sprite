#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# test-remote.sh: Runs integration tests inside the Fly.io Sprite environment
# ==============================================================================

ORG_NAME="${FLY_ORG:-erdem-391}"
SPRITE_NAME="${SPRITE_TARGET:-mimo-sprite}"

echo "=================================================="
echo "  Running Remote Integration Tests in Sprite"
echo "  Sprite : ${SPRITE_NAME}"
echo "  Org    : ${ORG_NAME}"
echo "=================================================="

export PATH="$HOME/.local/bin:$PATH"

if ! command -v sprite &> /dev/null; then
  echo "Error: sprite CLI not found. Run scripts/setup-sprite.sh first." >&2
  exit 1
fi

echo "==> Test 1: Verifying server process is alive..."
sprite exec -o "${ORG_NAME}" -s "${SPRITE_NAME}" -- pgrep -f "node src/index.js" > /dev/null || {
  echo "FAIL: Server process is not running in sprite." >&2
  exit 1
}
echo "PASS: Server process is running."

echo "==> Test 2: Testing GET /healthz endpoint on port 8080..."
HEALTH_RESP=$(sprite exec -o "${ORG_NAME}" -s "${SPRITE_NAME}" -- curl -sS -w "\n%{http_code}" http://localhost:8080/healthz)
HTTP_CODE=$(echo "${HEALTH_RESP}" | tail -n 1)
BODY=$(echo "${HEALTH_RESP}" | sed '$d')

if [ "${HTTP_CODE}" != "200" ]; then
  echo "FAIL: /healthz returned HTTP ${HTTP_CODE}. Body: ${BODY}" >&2
  exit 1
fi

if ! echo "${BODY}" | grep -q '"status":"ok"'; then
  echo "FAIL: /healthz body did not contain 'status: ok'. Body: ${BODY}" >&2
  exit 1
fi
echo "PASS: /healthz returned HTTP 200 with status 'ok'."

echo "==> Test 3: Testing GET /api/status endpoint..."
STATUS_RESP=$(sprite exec -o "${ORG_NAME}" -s "${SPRITE_NAME}" -- curl -sS -w "\n%{http_code}" http://localhost:8080/api/status)
HTTP_CODE=$(echo "${STATUS_RESP}" | tail -n 1)
BODY=$(echo "${STATUS_RESP}" | sed '$d')

if [ "${HTTP_CODE}" != "200" ]; then
  echo "FAIL: /api/status returned HTTP ${HTTP_CODE}. Body: ${BODY}" >&2
  exit 1
fi

if ! echo "${BODY}" | grep -q '"vaultConnected"'; then
  echo "FAIL: /api/status missing 'vaultConnected' property." >&2
  exit 1
fi

if ! echo "${BODY}" | grep -q '"mimoConfigured"'; then
  echo "FAIL: /api/status missing 'mimoConfigured' property." >&2
  exit 1
fi
echo "PASS: /api/status returned required structure: ${BODY}"

echo "==> Test 4: Verifying static mascot canvas is served..."
SVG_RESP=$(sprite exec -o "${ORG_NAME}" -s "${SPRITE_NAME}" -- curl -sS http://localhost:8080/mimo-sprite.svg | head -n 5)
if ! echo "${SVG_RESP}" | grep -q '<svg'; then
  echo "FAIL: /mimo-sprite.svg did not return SVG content." >&2
  exit 1
fi
echo "PASS: /mimo-sprite.svg is accessible."

echo "==> Test 5: Security audit - verifying no secret value leakage in responses..."
# Ensure responses do not contain 'apiKey' with secret values
if echo "${STATUS_RESP}" | grep -iE 'apiKey|secretValue|password'; then
  echo "FAIL: Sensitive keywords detected in API response!" >&2
  exit 1
fi
echo "PASS: Zero secret values exposed in public API."

echo "=================================================="
echo "  All remote integration tests passed successfully!"
echo "=================================================="
