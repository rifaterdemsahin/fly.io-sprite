# Fly.io Sprite: Xiaomi MiMo with Key Vault Integration

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![Fly.io Sprites](https://img.shields.io/badge/Fly.io-Sprites-purple.svg)](https://sprites.dev/)
[![Target Org](https://img.shields.io/badge/Fly.io%20Org-erdem--391-blue.svg)](https://fly.io)
[![Sprite Target](https://img.shields.io/badge/Sprite-mimo--sprite-orange.svg)](https://sprites.dev)

A production-ready **Fly.io Sprite** deployment for the **Xiaomi MiMo** mascot character. It listens on port `8080` (Fly.io Sprites default HTTP routing port), dynamically retrieves the Xiaomi MiMo API key from an Azure Key Vault or HashiCorp Vault, caches it securely in memory, and provides an interactive web canvas displaying the animated MiMo character with live Key Vault status telemetry.

---

## 📑 Architecture Overview

```
                        +----------------------------------------+
                        |         Incoming HTTP Request          |
                        |      https://mimo-sprite-erdem-391     |
                        |            .sprites.app                |
                        +-------------------+--------------------+
                                            | (Port 8080)
                                            v
     +-------------------------------------------------------------------------+
     |                       Fly.io Sprite: mimo-sprite                        |
     |                       (Ubuntu MicroVM - erdem-391)                      |
     |                                                                         |
     |   +-----------------------------------------------------------------+   |
     |   |               Web Server (src/index.js :8080)                   |   |
     |   |                                                                 |   |
     |   |   GET  /healthz     -> Server up-status & Vault reachability    |   |
     |   |   GET  /api/status  -> { vaultConnected, mimoConfigured }       |   |
     |   |   POST /api/refresh -> Re-sync cache with Key Vault             |   |
     |   |   POST /api/action  -> Mascot animation state trigger           |   |
     |   |   GET  /            -> Interactive Mascot Canvas UI             |   |
     |   +--------------------------------+--------------------------------+   |
     |                                    |                                    |
     |                                    v                                    |
     |   +-----------------------------------------------------------------+   |
     |   |               Key Vault Manager (src/vault.js)                  |   |
     |   |                                                                 |   |
     |   |   - In-memory secret caching (configurable TTL, default 5m)     |   |
     |   |   - Azure Key Vault (@azure/keyvault-secrets)                   |   |
     |   |   - HashiCorp Vault (REST API)                                  |   |
     |   |   - Local .env fallback for isolated testing                    |   |
     |   |   - Zero secret exposure across public endpoints                |   |
     |   +--------------------------------+--------------------------------+   |
     +------------------------------------|------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |       Azure / HashiCorp Key Vault     |
                      |  https://dp-kv-deliverypilot          |
                      |         .vault.azure.net              |
                      |  (Secret: MIMO_API_KEY / xiaomi-key)  |
                      +---------------------------------------+
```

---

## 📁 Repository Structure

```
.
├── .env.example              # Environment variables template
├── .gitignore                # Excludes secrets, node_modules, and logs
├── package.json              # Dependencies and lifecycle scripts
├── public/
│   ├── index.html            # Interactive mascot canvas & diagnostics UI
│   └── mimo-sprite.svg       # Scalable vector asset for Xiaomi MiMo character
├── scripts/
│   ├── setup-sprite.sh       # Installs CLI, authenticates, and provisions sprite
│   ├── deploy-sprite.sh      # Pushes code, configures env, starts server :8080
│   └── test-remote.sh        # Runs remote integration tests inside the sprite
├── src/
│   ├── index.js              # Express web server bound to 0.0.0.0:8080
│   └── vault.js              # Key Vault connector with in-memory caching & fallback
└── test/
    └── app.test.js           # Unit and integration test suite
```

---

## 🎨 Xiaomi MiMo Sprite Asset & Interactive Controls

The interactive mascot canvas in `public/index.html` renders `public/mimo-sprite.svg` with high-performance CSS keyframe animations:

1. **Idle Animation**:
   - Subtle hovering float (`idleFloat`).
   - Natural eye blink cycle every ~4 seconds (`eyeBlink`).
   - Gentle ear sway and ground shadow expansion.
2. **Active Animation**:
   - Energetic vertical bounce.
   - Frantic waving right paw (`franticWave`).
   - Pulsing chest beacon indicating Key Vault activity.
   - Emitting spark particles.
3. **Thinking Animation**:
   - Tilted head sway.
   - Rotating dual orbital halo rings.
4. **Live Key Vault Telemetry**:
   - Header badge indicates live connection state (`Vault: Connected`, `Vault: Local Fallback`, `Vault: Disconnected`).
   - Real-time MiMo key status (`MiMo Key: Configured` vs `Missing`).
   - Zero secret exposure guarantee: Keys are kept securely in memory and never rendered or emitted.

---

## 🔑 Key Vault Integration (`src/vault.js`)

`src/vault.js` dynamically resolves the Xiaomi MiMo secret using the following priority:

1. **In-Memory Cache**:
   - Returns cached secret if age is less than `VAULT_CACHE_TTL_MS` (default: 5 minutes).
2. **Azure Key Vault**:
   - If `VAULT_URL` contains `.vault.azure.net` or `AZURE_KEYVAULT_NAME` is defined.
   - Authenticates using `@azure/identity` (`DefaultAzureCredential` supports Azure CLI, environment variables, and managed identities).
   - Looks for `VAULT_SECRET_NAME` (e.g., `MIMO_API_KEY`, normalized to `mimo-api-key`, `xiaomi-key`, `mimo-project-management-key`).
3. **HashiCorp Vault**:
   - If `VAULT_TYPE=hashicorp` or generic HTTP endpoint with `VAULT_TOKEN`.
   - Queries `GET /v1/<mount>/data/<secretName>`.
4. **Local `.env` Fallback**:
   - If Key Vault is not reachable or unconfigured, falls back to `process.env.MIMO_API_KEY` or `process.env.XIAOMI_KEY` for local unit testing.

---

## 🚀 Getting Started Locally

### 1. Installation

```bash
git clone https://github.com/rifaterdemsahin/fly.io-sprite.git
cd fly.io-sprite
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure your vault details or local fallback key in `.env`:

```env
PORT=8080
HOST=0.0.0.0
VAULT_URL=https://dp-kv-deliverypilot.vault.azure.net
VAULT_SECRET_NAME=MIMO_API_KEY
AZURE_KEYVAULT_NAME=dp-kv-deliverypilot
# MIMO_API_KEY=local-test-key-only
```

### 3. Run Locally

```bash
# Start server on 0.0.0.0:8080
npm start

# Or with live reload
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) to interact with the MiMo mascot canvas.

### 4. Run Unit & Integration Tests

```bash
npm test
```

---

## ⚡ Fly.io Sprite Operations

Fly.io Sprites are persistent Ubuntu microVMs tailored for lightweight, stateful execution and scale-to-zero workloads.

All commands target organization **`erdem-391`** and sprite **`mimo-sprite`**.

### 1. Provision Sprite (`scripts/setup-sprite.sh`)

Installs the `sprite` CLI (if not installed), verifies authentication, and provisions `mimo-sprite` in `erdem-391`:

```bash
./scripts/setup-sprite.sh
```

Or run via npm:

```bash
npm run setup:sprite
```

Manual CLI equivalent:
```bash
# Authenticate
sprite login

# Create sprite targeting erdem-391
sprite create -o erdem-391 --skip-console mimo-sprite

# Enable public URL access
sprite config update -o erdem-391 -s mimo-sprite --url-auth public
```

### 2. Deploy Application (`scripts/deploy-sprite.sh`)

Pushes the codebase, sets secure runtime environment variables, installs dependencies, and launches the server listening on `0.0.0.0:8080`:

```bash
./scripts/deploy-sprite.sh
```

Or run via npm:

```bash
npm run deploy:sprite
```

Manual CLI equivalent:
```bash
# Push files
sprite file push -o erdem-391 -s mimo-sprite -r ./src/ /home/sprite/app/src/
sprite file push -o erdem-391 -s mimo-sprite -r ./public/ /home/sprite/app/public/
sprite file push -o erdem-391 -s mimo-sprite ./package.json /home/sprite/app/package.json

# Install dependencies and start server on port 8080
sprite exec -o erdem-391 -s mimo-sprite --dir /home/sprite/app -- npm install --omit=dev
sprite exec -o erdem-391 -s mimo-sprite --dir /home/sprite/app -- sh -c 'nohup node src/index.js > server.log 2>&1 &'
```

### 3. Run Remote Integration Tests (`scripts/test-remote.sh`)

Executes automated verification tests inside the sprite environment to validate HTTP 8080 routing, health status, and secret protection:

```bash
./scripts/test-remote.sh
```

Or run via npm:

```bash
npm run test:remote
```

Manual verification inside the sprite:
```bash
# Check health
sprite exec -o erdem-391 -s mimo-sprite -- curl -s http://localhost:8080/healthz

# Check status
sprite exec -o erdem-391 -s mimo-sprite -- curl -s http://localhost:8080/api/status
```

---

## 📡 API Reference

### `GET /healthz`
Verifies server health and Key Vault reachability.
- **Port:** `8080`
- **Response Format:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-24T20:34:21.858Z",
    "uptimeSeconds": 142,
    "service": "mimo-sprite",
    "org": "erdem-391",
    "vault": {
      "reachable": true,
      "source": "azure-key-vault (xiaomi-key)",
      "configured": true
    }
  }
  ```

### `GET /api/status`
Returns high-level status flags without exposing sensitive keys or tokens.
- **Port:** `8080`
- **Response Format:**
  ```json
  {
    "vaultConnected": true,
    "mimoConfigured": true,
    "metadata": {
      "vaultType": "azure",
      "secretName": "MIMO_API_KEY",
      "activeSource": "azure-key-vault (xiaomi-key)",
      "cached": true,
      "lastCachedAt": "2026-10-24T20:34:21.858Z",
      "error": null
    }
  }
  ```

### `POST /api/refresh`
Forces an immediate re-fetch of the MiMo API key from Key Vault, invalidating in-memory cache.
- **Response Format:**
  ```json
  {
    "success": true,
    "mimoConfigured": true,
    "source": "azure-key-vault (xiaomi-key)",
    "refreshedAt": "2026-10-24T20:35:00.000Z"
  }
  ```

### `POST /api/action`
Triggers mascot animations and records telemetry.
- **Payload:** `{"action": "wave" | "active" | "idle" | "think"}`
- **Response Format:**
  ```json
  {
    "action": "wave",
    "timestamp": "2026-10-24T20:35:05.123Z",
    "sprite": "mimo-sprite",
    "org": "erdem-391"
  }
  ```

---

## 🔒 Security & Credentials Policy

- **No Secrets in Git**: `.gitignore` strictly ignores `.env`, credential caches, `.sprite/`, and log files.
- **Least-Privilege Vault Access**: Connects to Azure Key Vault using scoped credentials (`Key Vault Secrets User`).
- **Memory-Only Secret Storage**: Secret values are cached only in memory and never written to disk or returned in API responses.
- **Organization Scoping**: All Sprites CLI operations are scoped strictly using `--org erdem-391`.

---

## 📄 License
MIT © [Rifat Erdem Sahin](https://github.com/rifaterdemsahin)
