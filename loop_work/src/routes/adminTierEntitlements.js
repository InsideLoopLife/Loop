'use strict';

const express = require('express');
const { requireAdminSession } = require('../utils/security');
const { PERIODS, LIMIT_TYPES, ACTIONS, SOURCES, Tier, TierEntitlement, UserTier, UsageEvent, BillingSettings, EntitlementAudit } = require('../models/tierModels');
const { DEFAULT_FEATURES, slugify, featureKey, publicTier, seedDefaults, auditChange, cleanText, clampNumber } = require('../services/entitlements.service');

const router = express.Router();
router.use(requireAdminSession);

function shopDomainFromReq(req) {
  if (!req.shopDomain) {
    const error = new Error('Admin session is missing a shop domain. Re-open admin from the authorised shop session.');
    error.statusCode = 401;
    throw error;
  }
  return req.shopDomain;
}

function parseBool(value, fallback = false) {
  if (value === undefined) return fallback;
  return value === true || value === 'true' || value === 1 || value === '1';
}

router.get('/summary', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    await seedDefaults(shopDomain);
    const [settings, tiers, entitlements, recentUsage, audits] = await Promise.all([
      BillingSettings.findOne({ shopDomain }).lean(),
      Tier.find({ shopDomain }).sort({ sortOrder: 1, monthlyPrice: 1 }).lean(),
      TierEntitlement.find({ shopDomain }).sort({ featureGroup: 1, featureName: 1, tierSlug: 1 }).lean(),
      UsageEvent.find({ shopDomain }).sort({ createdAt: -1 }).limit(50).lean(),
      EntitlementAudit.find({ shopDomain }).sort({ createdAt: -1 }).limit(30).lean(),
    ]);
    return res.json({ ok: true, settings, tiers: tiers.map(publicTier), entitlements, recentUsage, audits, defaultFeatures: DEFAULT_FEATURES });
  } catch (error) { next(error); }
});

router.patch('/settings', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const before = await BillingSettings.findOne({ shopDomain }).lean();
    const update = {
      billingEnabled: parseBool(req.body.billingEnabled),
      enforcementEnabled: parseBool(req.body.enforcementEnabled),
      signupPaymentRequired: parseBool(req.body.signupPaymentRequired),
      allowAllFeaturesDuringBeta: parseBool(req.body.allowAllFeaturesDuringBeta, true),
      auditUsageWhileFree: parseBool(req.body.auditUsageWhileFree, true),
      defaultTierSlug: slugify(req.body.defaultTierSlug || 'free'),
      freeFallbackTierSlug: slugify(req.body.freeFallbackTierSlug || 'free'),
      notes: cleanText(req.body.notes || '', 500),
    };
    const settings = await BillingSettings.findOneAndUpdate({ shopDomain }, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    await auditChange(req, { shopDomain, action: 'billing_settings.updated', targetType: 'billing_settings', targetKey: shopDomain, before, after: settings });
    return res.json({ ok: true, settings });
  } catch (error) { next(error); }
});

router.post('/tiers', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const slug = slugify(req.body.slug || req.body.name);
    const before = await Tier.findOne({ shopDomain, slug }).lean();
    const update = {
      name: cleanText(req.body.name || slug, 80),
      slug,
      description: cleanText(req.body.description || '', 400),
      isActive: parseBool(req.body.isActive, true),
      isPaid: parseBool(req.body.isPaid),
      visibleOnSignup: parseBool(req.body.visibleOnSignup, true),
      defaultSignupTier: parseBool(req.body.defaultSignupTier),
      monthlyPrice: clampNumber(req.body.monthlyPrice, 0, 999999, 0),
      annualPrice: clampNumber(req.body.annualPrice, 0, 9999999, 0),
      currency: cleanText(req.body.currency || 'GBP', 8).toUpperCase(),
      stripePriceMonthlyId: cleanText(req.body.stripePriceMonthlyId || '', 160),
      stripePriceAnnualId: cleanText(req.body.stripePriceAnnualId || '', 160),
      sortOrder: clampNumber(req.body.sortOrder, 0, 999, 50),
    };
    if (update.defaultSignupTier) await Tier.updateMany({ shopDomain }, { $set: { defaultSignupTier: false } });
    const tier = await Tier.findOneAndUpdate({ shopDomain, slug }, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    for (const feature of DEFAULT_FEATURES) {
      await TierEntitlement.updateOne({ shopDomain, tierSlug: slug, featureKey: feature.key }, { $setOnInsert: { shopDomain, tierSlug: slug, featureKey: feature.key, featureName: feature.name, featureGroup: feature.group, description: feature.description, limitType: feature.limitType, limitPeriod: feature.period, auditOnly: true } }, { upsert: true });
    }
    await auditChange(req, { shopDomain, action: before ? 'tier.updated' : 'tier.created', targetType: 'tier', targetKey: slug, before, after: tier });
    return res.json({ ok: true, tier: publicTier(tier) });
  } catch (error) { next(error); }
});

router.patch('/entitlements/:tierSlug/:featureKey', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const tierSlug = slugify(req.params.tierSlug);
    const key = featureKey(req.params.featureKey);
    const before = await TierEntitlement.findOne({ shopDomain, tierSlug, featureKey: key }).lean();
    const update = {
      enabled: parseBool(req.body.enabled),
      featureName: cleanText(req.body.featureName || key, 120),
      featureGroup: cleanText(req.body.featureGroup || 'General', 80),
      description: cleanText(req.body.description || '', 500),
      limitType: LIMIT_TYPES.includes(req.body.limitType) ? req.body.limitType : 'boolean',
      limitValue: clampNumber(req.body.limitValue, 0, 9999999, 0),
      limitPeriod: PERIODS.includes(req.body.limitPeriod) ? req.body.limitPeriod : 'none',
      exceededAction: ACTIONS.includes(req.body.exceededAction) ? req.body.exceededAction : 'upgrade',
      upgradeMessage: cleanText(req.body.upgradeMessage || '', 280),
      auditOnly: parseBool(req.body.auditOnly, true),
    };
    const entitlement = await TierEntitlement.findOneAndUpdate({ shopDomain, tierSlug, featureKey: key }, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    await auditChange(req, { shopDomain, action: 'entitlement.updated', targetType: 'entitlement', targetKey: `${tierSlug}:${key}`, before, after: entitlement });
    return res.json({ ok: true, entitlement });
  } catch (error) { next(error); }
});

router.post('/users/:userId/tier', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const userId = cleanText(req.params.userId, 160);
    const before = await UserTier.findOne({ shopDomain, userId }).lean();
    const update = {
      tierSlug: slugify(req.body.tierSlug || 'free'),
      source: SOURCES.includes(req.body.source) ? req.body.source : 'manual',
      status: ['active', 'trialing', 'past_due', 'cancelled', 'expired'].includes(req.body.status) ? req.body.status : 'active',
      manualOverride: parseBool(req.body.manualOverride, true),
      overrideReason: cleanText(req.body.overrideReason || '', 300),
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
    };
    const userTier = await UserTier.findOneAndUpdate({ shopDomain, userId }, { $set: update, $setOnInsert: { startsAt: new Date() } }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    await auditChange(req, { shopDomain, action: 'user_tier.updated', targetType: 'user_tier', targetKey: userId, before, after: userTier });
    return res.json({ ok: true, userTier });
  } catch (error) { next(error); }
});

router.get('/audit', async (req, res, next) => {
  try {
    const shopDomain = shopDomainFromReq(req);
    const audits = await EntitlementAudit.find({ shopDomain }).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ ok: true, audits });
  } catch (error) { next(error); }
});

module.exports = router;
