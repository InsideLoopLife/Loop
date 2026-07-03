'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const required = [
  'src/models/tierModels.js',
  'src/services/entitlements.service.js',
  'src/routes/adminTierEntitlements.js',
  'src/routes/userEntitlements.js',
  'src/routes/tierEntitlements.js',
  'src/utils/entitlementsClient.js',
  'public/tier-entitlements-admin.js',
  'public/tier-entitlements-admin.css',
  'docs/README-v27.43-tier-entitlements-HARDENED.md',
  'docs/app-js-mount-snippet-HARDENED.md',
  'docs/live-beta-readiness.md',
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Missing tier entitlement files:', missing.join(', '));
  process.exit(1);
}
console.log('Tier entitlements hardened package file check passed.');
