'use strict';

/**
 * Server-side helper for feature gates.
 * Use this inside user-facing API actions before running expensive/restricted work.
 *
 * For direct in-process checks, import checkEntitlement from:
 *   src/services/entitlements.service.js
 */
async function requireEntitlement({ checkEntitlement, shopDomain, userId, featureKey, quantity = 1, currentValue = null, meta = {} }) {
  if (typeof checkEntitlement !== 'function') throw new Error('checkEntitlement service is required.');
  const result = await checkEntitlement({ shopDomain, userId, featureKey, quantity, currentValue, meta });
  if (!result.allowed) {
    const error = new Error(result.entitlement?.upgradeMessage || 'Upgrade required for this feature.');
    error.statusCode = result.action === 'block' ? 403 : 402;
    error.entitlement = result;
    throw error;
  }
  return result;
}

async function checkEntitlementFromBrowser({ featureKey, quantity = 1, currentValue = null, meta = {}, recordUsage = true }) {
  const response = await fetch('/api/entitlements/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ featureKey, quantity, currentValue, meta, recordUsage }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Entitlement check failed');
  return json;
}

module.exports = { requireEntitlement, checkEntitlementFromBrowser };
