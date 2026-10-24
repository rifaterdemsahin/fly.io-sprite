'use strict';

const express = require('express');
const path = require('path');
const { getStatus, getMimoApiKey } = require('./vault');

const app = express();
const PORT = parseInt(process.env.SPRITE_PORT || process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const startTime = Date.now();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

/**
 * Health check endpoint: Verifies server up-status and vault reachability.
 * Endpoint: GET /healthz
 */
app.get('/healthz', async (req, res) => {
  try {
    const status = await getStatus();
    const uptimeSec = Math.floor((Date.now() - startTime) / 1000);

    const isHealthy = status.vaultConnected || status.mimoConfigured;

    res.status(isHealthy ? 200 : 200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: uptimeSec,
      service: 'mimo-sprite',
      org: 'erdem-391',
      vault: {
        reachable: status.vaultConnected,
        source: status.activeSource,
        configured: status.mimoConfigured
      }
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: err.message
    });
  }
});

/**
 * Status endpoint: Returns { vaultConnected: boolean, mimoConfigured: boolean }
 * Strictly guarantees no secret values are exposed.
 * Endpoint: GET /api/status
 */
app.get('/api/status', async (req, res) => {
  try {
    const status = await getStatus();

    // Standard minimal payload conforming to specification
    res.json({
      vaultConnected: Boolean(status.vaultConnected),
      mimoConfigured: Boolean(status.mimoConfigured),
      metadata: {
        vaultType: status.vaultType,
        secretName: status.secretName,
        activeSource: status.activeSource,
        cached: status.details?.cached ?? false,
        lastCachedAt: status.details?.lastCachedAt ?? null,
        error: status.details?.vaultError ?? null
      }
    });
  } catch (err) {
    res.status(500).json({
      vaultConnected: false,
      mimoConfigured: false,
      error: 'Failed to evaluate vault status'
    });
  }
});

/**
 * Trigger cache refresh / re-sync with Vault
 * Endpoint: POST /api/refresh
 */
app.post('/api/refresh', async (req, res) => {
  try {
    const data = await getMimoApiKey({ forceRefresh: true });
    res.json({
      success: true,
      mimoConfigured: Boolean(data.apiKey),
      source: data.source,
      refreshedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Sprite state telemetry / interactive triggers
 * Endpoint: POST /api/action
 */
app.post('/api/action', (req, res) => {
  const { action } = req.body || {};
  const validActions = ['idle', 'active', 'wave', 'think', 'sync'];
  const selectedAction = validActions.includes(action) ? action : 'idle';

  res.json({
    action: selectedAction,
    timestamp: new Date().toISOString(),
    sprite: 'mimo-sprite',
    org: 'erdem-391'
  });
});

// Explainer guide route
app.get(['/explainer', '/explainer.html'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'explainer.html'));
});

// Fallback to mascot page for HTML navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start listening on 0.0.0.0:8080 (Fly Sprites default routing)
const server = app.listen(PORT, HOST, () => {
  console.log(`===============================================`);
  console.log(` Xiaomi MiMo Sprite Server listening on ${HOST}:${PORT}`);
  console.log(` Fly.io Org: erdem-391 | Sprite: mimo-sprite`);
  console.log(` Health: http://${HOST}:${PORT}/healthz`);
  console.log(` Status: http://${HOST}:${PORT}/api/status`);
  console.log(`===============================================`);
});

// Graceful shutdown handling
function handleShutdown(signal) {
  console.log(`[Server] Received ${signal}. Closing HTTP listener...`);
  server.close(() => {
    console.log('[Server] Gracefully terminated.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = { app, server };
