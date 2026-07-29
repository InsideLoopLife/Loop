'use strict';

const express = require('express');
const { checkEntitlement, cleanText } = require('../services/entitlements.service');

const router = express.Router();

function requireUserSession(req, res, next) {
  const userId = cleanText(req.user?.id || req.session?.userId || req.headers['x-loop-user-id'] || req.body.userId || '', 160);
  const shopDomain = cleanText(req.shopDomain || req.headers['x-shop-domain'] || req.body.shopDomain || req.query.shopDomain || '', 180);
  if (!userId) return res.status(401).json({ ok: false, error: 'User session required.' });
  if (!shopDomain) return res.status(400).json({ ok: false, error: 'Shop/app context required.' });
  req.loopUserId = userId;
  req.loopShopDomain = shopDomain;
  return next();
}

router.post('/check', requireUserSession, async (req, res, next) => {
  try {
    const result = await checkEntitlement({
      shopDomain: req.loopShopDomain,
      userId: req.loopUserId,
      featureKey: req.body.featureKey,
      quantity: req.body.quantity || 1,
      currentValue: req.body.currentValue,
      meta: req.body.meta || {},
      recordUsage: req.body.recordUsage !== false,
    });
    return res.json(result);
  } catch (error) { next(error); }
});

module.exports = router;
module.exports.requireUserSession = requireUserSession;
