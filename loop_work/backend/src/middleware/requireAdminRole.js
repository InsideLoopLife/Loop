'use strict';

function requireAdminRole(req, res, next) {
  const appRole = req.user?.appMetadata?.role;
  const userRole = req.user?.userMetadata?.role;
  const role = appRole || userRole || '';

  if (!['owner', 'admin', 'support'].includes(role)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  return next();
}

module.exports = { requireAdminRole };
