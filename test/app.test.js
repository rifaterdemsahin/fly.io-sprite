'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Set test environment variables
process.env.PORT = '8081';
process.env.HOST = '127.0.0.1';
process.env.VAULT_URL = '';
process.env.AZURE_KEYVAULT_NAME = '';
process.env.MIMO_API_KEY = 'test-secret-key-12345';
process.env.VAULT_SECRET_NAME = 'MIMO_API_KEY';

const { getMimoApiKey, getStatus } = require('../src/vault');
const { app, server } = require('../src/index');

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8081,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: null, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

test('Vault - Retrieves fallback secret from environment', async () => {
  const result = await getMimoApiKey({ forceRefresh: true });
  assert.equal(result.apiKey, 'test-secret-key-12345');
  assert.ok(result.source.includes('local-env'));
});

test('Vault - Caches retrieved secret in memory', async () => {
  await getMimoApiKey({ forceRefresh: true });
  const cachedResult = await getMimoApiKey({ forceRefresh: false });
  assert.equal(cachedResult.cached, true);
  assert.equal(cachedResult.apiKey, 'test-secret-key-12345');
});

test('Vault - getStatus() returns boolean indicators without exposing secret value', async () => {
  const status = await getStatus();
  assert.equal(typeof status.vaultConnected, 'boolean');
  assert.equal(status.mimoConfigured, true);
  assert.equal(status.secretName, 'MIMO_API_KEY');

  const jsonString = JSON.stringify(status);
  assert.ok(!jsonString.includes('test-secret-key-12345'), 'Secret must not be exposed in getStatus()');
});

test('Web Server - GET /healthz returns status ok and vault info', async () => {
  const res = await makeRequest('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.service, 'mimo-sprite');
  assert.equal(res.body.org, 'erdem-391');
  assert.ok(typeof res.body.vault.configured === 'boolean');
});

test('Web Server - GET /api/status returns { vaultConnected, mimoConfigured }', async () => {
  const res = await makeRequest('/api/status');
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.vaultConnected, 'boolean');
  assert.equal(typeof res.body.mimoConfigured, 'boolean');
  assert.ok(!res.raw.includes('test-secret-key-12345'), 'Secret must never leak in /api/status');
});

test('Web Server - POST /api/action handles sprite interactions', async () => {
  const res = await makeRequest('/api/action', {
    method: 'POST',
    body: { action: 'wave' }
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.action, 'wave');
  assert.equal(res.body.sprite, 'mimo-sprite');
});

test('Web Server - GET /mimo-sprite.svg serves SVG asset', async () => {
  const res = await makeRequest('/mimo-sprite.svg');
  assert.equal(res.status, 200);
  assert.ok(res.raw.includes('<svg'), 'Response must contain SVG elements');
  assert.ok(res.raw.includes('mimo-full-body'), 'Response must contain mimo elements');
});

test.after(() => {
  server.close();
});
