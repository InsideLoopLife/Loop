'use strict';

// Backwards-compatible mount for v27.43 packages that already imported this file.
// Prefer mounting src/routes/adminTierEntitlements.js at /api/admin/tier-entitlements
// and src/routes/userEntitlements.js at /api/entitlements.
module.exports = require('./adminTierEntitlements');
