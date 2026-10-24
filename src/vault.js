'use strict';

require('dotenv').config();

// In-memory cache for retrieved key
let cachedSecret = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = parseInt(process.env.VAULT_CACHE_TTL_MS, 10) || 5 * 60 * 1000; // 5 minutes

/**
 * Determines the target secret name. Default requested: "MIMO_API_KEY"
 */
function getSecretName() {
  return process.env.VAULT_SECRET_NAME || 'MIMO_API_KEY';
}

/**
 * Resolves the Vault URL if available (Azure Key Vault or HashiCorp Vault).
 */
function getVaultUrl() {
  if (process.env.VAULT_URL) {
    let url = process.env.VAULT_URL.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // E.g. user provided "my-vault.vault.azure.net" or "my-vault"
      if (url.includes('.vault.azure.net')) {
        url = `https://${url}`;
      } else {
        url = `https://${url}.vault.azure.net`;
      }
    }
    return url.replace(/\/+$/, '');
  }

  if (process.env.AZURE_KEYVAULT_NAME) {
    return `https://${process.env.AZURE_KEYVAULT_NAME.trim()}.vault.azure.net`;
  }

  return null;
}

/**
 * Detects whether the URL points to Azure Key Vault or HashiCorp Vault.
 */
function getVaultType(vaultUrl) {
  if (!vaultUrl) return 'none';
  if (process.env.VAULT_TYPE) {
    return process.env.VAULT_TYPE.toLowerCase();
  }
  if (vaultUrl.includes('.vault.azure.net')) {
    return 'azure';
  }
  return 'hashicorp';
}

/**
 * Checks if a string is a valid Azure Key Vault secret name (alphanumeric and dashes only).
 */
function isValidAzureSecretName(name) {
  return /^[0-9a-zA-Z-]+$/.test(name);
}

/**
 * Fetches secret from Azure Key Vault using @azure/keyvault-secrets and @azure/identity
 */
async function fetchFromAzureKeyVault(vaultUrl, secretName) {
  const { SecretClient } = require('@azure/keyvault-secrets');
  const { DefaultAzureCredential } = require('@azure/identity');

  const credential = new DefaultAzureCredential();
  const client = new SecretClient(vaultUrl, credential);

  // Azure Key Vault secret names only allow alphanumeric and dashes
  const rawCandidates = [
    secretName.replace(/_/g, '-'),
    secretName.toLowerCase().replace(/_/g, '-'),
    secretName,
    'xiaomi-key',
    'xiaomi-token-plan-key',
    'mimo-project-management-key'
  ];

  // Filter only valid Azure Key Vault secret names
  const candidates = [...new Set(rawCandidates.filter(isValidAzureSecretName))];

  let lastErr = null;
  for (const name of candidates) {
    try {
      const secret = await client.getSecret(name);
      if (secret && secret.value) {
        return {
          value: secret.value,
          resolvedName: name,
          source: `azure-key-vault (${name})`
        };
      }
    } catch (err) {
      lastErr = err;
      // Continue searching on 404
      if (err.statusCode === 404 || err.code === 'SecretNotFound') {
        continue;
      }
      // If permission or other error, break out
      break;
    }
  }

  throw lastErr || new Error(`Secret ${secretName} not found in Azure Key Vault ${vaultUrl}`);
}

/**
 * Fetches secret from HashiCorp Vault via HTTP API
 */
async function fetchFromHashiCorpVault(vaultUrl, secretName) {
  const token = process.env.VAULT_TOKEN;
  if (!token) {
    throw new Error('VAULT_TOKEN environment variable is required for HashiCorp Vault');
  }

  const mountPath = process.env.VAULT_MOUNT_PATH || 'secret';
  const url = `${vaultUrl}/v1/${mountPath}/data/${secretName}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Vault-Token': token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HashiCorp Vault returned status ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const secretData = data?.data?.data || data?.data;
  const value = secretData?.[secretName] || secretData?.value || secretData?.apiKey || (typeof secretData === 'string' ? secretData : null);

  if (!value) {
    throw new Error(`Secret ${secretName} not found in HashiCorp Vault response`);
  }

  return {
    value,
    resolvedName: secretName,
    source: `hashicorp-vault (${secretName})`
  };
}

/**
 * Fallback to local environment (.env)
 */
function fetchFromEnv(secretName) {
  const envCandidates = [
    secretName,
    secretName.toUpperCase(),
    'MIMO_API_KEY',
    'XIAOMI_KEY',
    'MIMO_KEY'
  ];

  for (const key of envCandidates) {
    if (process.env[key]) {
      return {
        value: process.env[key],
        resolvedName: key,
        source: `local-env (${key})`
      };
    }
  }

  return null;
}

/**
 * Main retrieval function:
 * 1. Checks memory cache (unless refresh=true)
 * 2. Attempts remote Key Vault (Azure or HashiCorp)
 * 3. Falls back to local .env
 */
async function getMimoApiKey({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cachedSecret && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return {
      apiKey: cachedSecret.value,
      source: cachedSecret.source,
      cached: true,
      lastCachedAt: new Date(cacheTimestamp).toISOString()
    };
  }

  const secretName = getSecretName();
  const vaultUrl = getVaultUrl();
  const vaultType = getVaultType(vaultUrl);

  let result = null;
  let vaultError = null;

  if (vaultUrl && vaultType !== 'none') {
    try {
      if (vaultType === 'azure') {
        result = await fetchFromAzureKeyVault(vaultUrl, secretName);
      } else if (vaultType === 'hashicorp') {
        result = await fetchFromHashiCorpVault(vaultUrl, secretName);
      }
    } catch (err) {
      vaultError = err.message || String(err);
      console.warn(`[Vault] Remote Key Vault lookup failed: ${vaultError}. Checking local fallback...`);
    }
  }

  // Fallback to .env / process.env
  if (!result) {
    const envResult = fetchFromEnv(secretName);
    if (envResult) {
      result = envResult;
    }
  }

  if (result) {
    cachedSecret = result;
    cacheTimestamp = now;
    return {
      apiKey: result.value,
      source: result.source,
      cached: false,
      lastCachedAt: new Date(cacheTimestamp).toISOString(),
      vaultError: vaultError || null
    };
  }

  return {
    apiKey: null,
    source: 'none',
    cached: false,
    lastCachedAt: null,
    vaultError: vaultError || 'No vault credentials or .env fallback configured'
  };
}

/**
 * Returns current status without exposing the secret value.
 */
async function getStatus() {
  const vaultUrl = getVaultUrl();
  const vaultType = getVaultType(vaultUrl);
  const secretName = getSecretName();

  let vaultConnected = false;
  let mimoConfigured = false;
  let activeSource = 'none';
  let details = {};

  try {
    const data = await getMimoApiKey({ forceRefresh: false });
    if (data.apiKey) {
      mimoConfigured = true;
      activeSource = data.source;
    }
    // Consider vault connected if we fetched from remote vault or verified vault endpoint
    if (data.source.startsWith('azure-key-vault') || data.source.startsWith('hashicorp-vault')) {
      vaultConnected = true;
    } else if (vaultUrl && !data.vaultError) {
      vaultConnected = true;
    }
    details = {
      source: data.source,
      cached: data.cached,
      lastCachedAt: data.lastCachedAt,
      vaultError: data.vaultError
    };
  } catch (err) {
    details = {
      error: err.message
    };
  }

  return {
    vaultConnected,
    mimoConfigured,
    vaultUrl: vaultUrl ? vaultUrl.replace(/:\/\/.*@/, '://') : null,
    vaultType,
    secretName,
    activeSource,
    details
  };
}

module.exports = {
  getMimoApiKey,
  getStatus,
  getVaultUrl,
  getSecretName,
  CACHE_TTL_MS
};
