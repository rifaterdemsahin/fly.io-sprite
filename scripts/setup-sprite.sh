#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# setup-sprite.sh: Provisions the Fly.io Sprite for mimo-sprite under erdem-391
# ==============================================================================

ORG_NAME="${FLY_ORG:-erdem-391}"
SPRITE_NAME="${SPRITE_TARGET:-mimo-sprite}"

echo "=================================================="
echo "  Setting up Fly.io Sprite: ${SPRITE_NAME}"
echo "  Target Organization   : ${ORG_NAME}"
echo "=================================================="

# Ensure ~/.local/bin is in PATH (Sprites CLI default install directory)
export PATH="$HOME/.local/bin:$PATH"

# 1. Install Sprites CLI if missing
if ! command -v sprite &> /dev/null; then
  echo "==> Sprite CLI not found in PATH. Installing via https://sprites.dev/install.sh..."
  curl -sSL https://sprites.dev/install.sh | bash
  export PATH="$HOME/.local/bin:$PATH"
fi

echo "==> Sprites CLI version:"
sprite --version || true

# 2. Check Authentication
echo "==> Verifying Sprite authentication..."
if ! sprite org list &> /dev/null; then
  echo "==> Not authenticated with Sprites."
  if [ -n "${SPRITE_API_TOKEN:-}" ]; then
    echo "==> Authenticating using SPRITE_API_TOKEN..."
    sprite auth setup --token "${SPRITE_API_TOKEN}"
  elif [ -n "${FLY_API_TOKEN:-}" ]; then
    echo "==> Found FLY_API_TOKEN. Authenticating..."
    sprite auth setup --token "${FLY_API_TOKEN}"
  else
    echo "==> Launching interactive login..."
    sprite login
  fi
else
  echo "==> Sprites CLI already authenticated."
fi

# 3. Create Sprite if not already present
echo "==> Checking if sprite '${SPRITE_NAME}' exists under org '${ORG_NAME}'..."
EXISTING_SPRITES=$(sprite list -o "${ORG_NAME}" 2>/dev/null || true)

if echo "${EXISTING_SPRITES}" | grep -q "${SPRITE_NAME}"; then
  echo "==> Sprite '${SPRITE_NAME}' already exists under org '${ORG_NAME}'."
else
  echo "==> Provisioning sprite '${SPRITE_NAME}' in org '${ORG_NAME}'..."
  sprite create -o "${ORG_NAME}" --skip-console "${SPRITE_NAME}"
  echo "==> Sprite '${SPRITE_NAME}' created successfully."
fi

# 4. Optional: Set URL configuration for public access demo
echo "==> Setting URL authentication to public for web access..."
sprite config update -o "${ORG_NAME}" -s "${SPRITE_NAME}" --url-auth public || true

# 5. Display Sprite details
echo "==> Sprite Information:"
sprite info -o "${ORG_NAME}" -s "${SPRITE_NAME}" || true

echo "=================================================="
echo "  Setup Complete for ${SPRITE_NAME} (${ORG_NAME})"
echo "=================================================="
