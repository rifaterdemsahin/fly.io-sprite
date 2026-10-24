#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# deploy-sprite.sh: Pushes code and configures Fly.io Sprite mimo-sprite
# ==============================================================================

ORG_NAME="${FLY_ORG:-erdem-391}"
SPRITE_NAME="${SPRITE_TARGET:-mimo-sprite}"
REMOTE_APP_DIR="/home/sprite/app"

echo "=================================================="
echo "  Deploying to Fly.io Sprite: ${SPRITE_NAME}"
echo "  Target Organization       : ${ORG_NAME}"
echo "=================================================="

export PATH="$HOME/.local/bin:$PATH"

if ! command -v sprite &> /dev/null; then
  echo "Error: sprite CLI is not installed. Run scripts/setup-sprite.sh first." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 1. Create target remote directory in Sprite
echo "==> Preparing remote application directory (${REMOTE_APP_DIR})..."
sprite exec -o "${ORG_NAME}" -s "${SPRITE_NAME}" -- mkdir -p "${REMOTE_APP_DIR}/public" "${REMOTE_APP_DIR}/src"

# 2. Sync codebase to Sprite
echo "==> Pushing files to Sprite..."
sprite file push -o "${ORG_NAME}" -s "${SPRITE_NAME}" "${ROOT_DIR}/package.json" "${REMOTE_APP_DIR}/package.json"
sprite file push -o "${ORG_NAME}" -s "${SPRITE_NAME}" "${ROOT_DIR}/package-lock.json" "${REMOTE_APP_DIR}/package-lock.json" 2>/dev/null || true
sprite file push -o "${ORG_NAME}" -s "${SPRITE_NAME}" -r "${ROOT_DIR}/src/" "${REMOTE_APP_DIR}/"
sprite file push -o "${ORG_NAME}" -s "${SPRITE_NAME}" -r "${ROOT_DIR}/public/" "${REMOTE_APP_DIR}/"

# 3. Configure runtime environment secrets dynamically (without committing secrets)
echo "==> Configuring runtime environment configuration on Sprite..."
TMP_ENV=$(mktemp)
trap 'rm -f "${TMP_ENV}"' EXIT

cat <<EOF > "${TMP_ENV}"
PORT=8080
HOST=0.0.0.0
NODE_ENV=production
VAULT_URL=${VAULT_URL:-https://dp-kv-deliverypilot.vault.azure.net}
VAULT_SECRET_NAME=${VAULT_SECRET_NAME:-MIMO_API_KEY}
AZURE_KEYVAULT_NAME=${AZURE_KEYVAULT_NAME:-dp-kv-deliverypilot}
VAULT_CACHE_TTL_MS=${VAULT_CACHE_TTL_MS:-300000}
EOF

# Include optional fallback key if provided in local environment
if [ -n "${MIMO_API_KEY:-}" ]; then
  echo "MIMO_API_KEY=${MIMO_API_KEY}" >> "${TMP_ENV}"
fi

# Push .env to sprite and restrict permissions
sprite file push -o "${ORG_NAME}" -s "${SPRITE_NAME}" "${TMP_ENV}" "${REMOTE_APP_DIR}/.env"
sprite exec -o "${ORG_NAME}" -s "${SPRITE_NAME}" -- chmod 600 "${REMOTE_APP_DIR}/.env"

# 4. Install production dependencies inside Sprite
echo "==> Installing Node.js dependencies inside Sprite..."
sprite exec -o "${ORG_NAME}" -s "${SPRITE_NAME}" --dir "${REMOTE_APP_DIR}" -- npm install --omit=dev

# 5. Stop existing server process if running, then launch server on port 8080
echo "==> Launching server listening on 0.0.0.0:8080..."
sprite exec -o "${ORG_NAME}" -s "${SPRITE_NAME}" -- sh -c '
  pkill -f "node src/index.js" || true
  cd /home/sprite/app
  nohup node src/index.js > /home/sprite/app/server.log 2>&1 &
  sleep 2
'

# 6. Verify server started
echo "==> Checking remote process status..."
sprite exec -o "${ORG_NAME}" -s "${SPRITE_NAME}" -- sh -c '
  ps aux | grep "node src/index.js" | grep -v grep || {
    echo "Server failed to start. Last log lines:"
    cat /home/sprite/app/server.log
    exit 1
  }
'

echo "==> Deployment successful!"
echo "==> Service is listening on 0.0.0.0:8080"
sprite info -o "${ORG_NAME}" -s "${SPRITE_NAME}" || true
