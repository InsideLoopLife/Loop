'use strict';

const {
  Tier,
  TierEntitlement,
  UserTier,
  UsageEvent,
  UsageCounter,
  BillingSettings,
  EntitlementAudit,
} = require('../models/tierModels');
const { cleanText, clampNumber } = require('../utils/validation');

const DEFAULT_FEATURES = [
  { key: 'ai_chat_messages', name: 'AI chat messages', group: 'AI', limitType: 'soft_usage_count', defaultLimit: 25, period: 'day', description: 'Number of AI coach/chat messages allowed.' },
  { key: 'ai_food_photo_scans', name: 'Food photo scans', group: 'AI', limitType: 'soft_usage_count', defaultLimit: 10, period: 'month', description: 'Image-based food logging scans.' },
  { key: 'household_members', name: 'Household members', group: 'Sharing', limitType: 'state_count', defaultLimit: 2, period: 'none', description: 'Maximum people inside a household.' },
  { key: 'shared_profiles', name: 'Shared profiles', group: 'Sharing', limitType: 'state_count', defaultLimit: 1, period: 'none', description: 'Extra linked profiles a user can manage.' },
  { key: 'realtime_market_data', name: 'Realtime market data', group: 'Wealth', limitType: 'boolean', defaultLimit: 0, period: 'none', description: 'Access to paid/live market data feeds.' },
  { key: 'watchlist_items', name: 'Watchlist items', group: 'Wealth', limitType: 'state_count', defaultLimit: 10, period: 'none', description: 'Number of holdings/watchlist rows.' },
  { key: 'health_advanced_insights', name: 'Advanced health insights', group: 'Health', limitType: 'boolean', defaultLimit: 1, period: 'none', description: 'Deeper macros, trend detection and recommendations.' },
  { key: 'export_data', name: 'Data export', group: 'Account', limitType: 'boolean', defaultLimit: 0, period: 'none', description: 'CSV/PDF export and portability.' },
];

function slugify(value) {
  return cleanText(value, 80).toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^-|-$/g, '') || 'tier';
}

function featureKey(value) {
  return slugify(value).replace(/-/g, '_');
}

function publicTier(tier) {
  return {
    id: String(tier._id),
    name: tier.name,
    slug: tier.slug,
    description: tier.description || '',
    isActive: tier.isActive !== false,
    isPaid: Boolean(tier.isPaid),
    visibleOnSignup: tier.visibleOnSignup !== false,
    defaultSignupTier: Boolean(tier.defaultSignupTier),
    monthlyPrice: Number(tier.monthlyPrice || 0),
    annualPrice: Number(tier.annualPrice || 0),
    currency: tier.currency || 'GBP',
    stripePriceMonthlyId: tier.stripePriceMonthlyId || '',
    stripePriceAnnualId: tier.stripePriceAnnualId || '',
    sortOrder: Number(tier.sortOrder || 0),
  };
}

async function seedDefaults(shopDomain) {
  const defaults = [
    { name: 'Free', slug: 'free', description: 'Testing/default access.', sortOrder: 10, monthlyPrice: 0, annualPrice: 0, defaultSignupTier: true, isPaid: false },
    { name: 'Plus', slug: 'plus', description: 'Health, sharing and higher AI limits.', sortOrder: 20, monthlyPrice: 799, annualPrice: 7990, isPaid: true },
    { name: 'Pro', slug: 'pro', description: 'Full AI, advanced wealth and paid data-ready tier.', sortOrder: 30, monthlyPrice: 1499, annualPrice: 14990, isPaid: true },
    { name: 'Staff', slug: 'staff', description: 'Internal/staff override.', sortOrder: 90, visibleOnSignup: false, isPaid: false },
  ];

  for (const tier of defaults) {
    await Tier.updateOne({ shopDomain, slug: tier.slug }, { $setOnInsert: { shopDomain, ...tier } }, { upsert: true });
  }
  await BillingSettings.updateOne({ shopDomain }, { $setOnInsert: { shopDomain } }, { upsert: true });

  for (const tier of defaults) {
    for (const feature of DEFAULT_FEATURES) {
      const pro = tier.slug === 'pro' || tier.slug === 'staff';
      const plus = tier.slug === 'plus';
      const enabled = pro || plus || ['ai_chat_messages', 'household_members', 'watchlist_items', 'health_advanced_insights'].includes(feature.key);
      const multiplier = pro ? 9999 : plus ? 4 : 1;
      await TierEntitlement.updateOne(
        { shopDomain, tierSlug: tier.slug, featureKey: feature.key },
        { $setOnInsert: {
          shopDomain,
          tierSlug: tier.slug,
          featureKey: feature.key,
          featureName: feature.name,
          featureGroup: feature.group,
          description: feature.description,
          enabled,
          limitType: feature.limitType,
          limitValue: feature.limitType === 'boolean' ? (enabled ? 1 : 0) : feature.defaultLimit * multiplier,
          limitPeriod: feature.period,
          exceededAction: 'upgrade',
          auditOnly: true,
        } },
        { upsert: true }
      );
    }
  }
}

function getActor(req) {
  return {
    actorId: cleanText(req.adminUserId || req.user?.id || req.headers['x-admin-user'] || 'admin-session', 160),
    actorRole: cleanText(req.adminRole || req.user?.role || 'admin', 40),
    ip: cleanText(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '', 120),
    userAgent: cleanText(req.headers['user-agent'] || '', 500),
  };
}

async function auditChange(req, { shopDomain, action, targetType, targetKey, before = null, after = null }) {
  try {
    await EntitlementAudit.create({ shopDomain, action, targetType, targetKey, before, after, ...getActor(req) });
  } catch (error) {
    console.warn('Entitlement audit write failed:', error.message);
  }
}

function isUserTierCurrentlyValid(userTier, now = new Date()) {
  if (!userTier) return false;
  if (!['active', 'trialing'].includes(userTier.status)) return false;
  if (userTier.expiresAt && new Date(userTier.expiresAt).getTime() < now.getTime()) return false;
  return true;
}

function bucketForPeriod(period, now = new Date()) {
  const d = new Date(now);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  if (period === 'day') {
    const resetsAt = new Date(Date.UTC(yyyy, d.getUTCMonth(), d.getUTCDate() + 1));
    return { bucketKey: `${yyyy}-${mm}-${dd}`, resetsAt };
  }
  if (period === 'week') {
    const start = new Date(Date.UTC(yyyy, d.getUTCMonth(), d.getUTCDate()));
    const day = start.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
    const resetsAt = new Date(start);
    resetsAt.setUTCDate(resetsAt.getUTCDate() + 7);
    return { bucketKey: `${start.getUTCFullYear()}-W${Math.ceil((((start - new Date(Date.UTC(start.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7)}`, resetsAt };
  }
  if (period === 'month') {
    const resetsAt = new Date(Date.UTC(yyyy, d.getUTCMonth() + 1, 1));
    return { bucketKey: `${yyyy}-${mm}`, resetsAt };
  }
  if (period === 'year') {
    const resetsAt = new Date(Date.UTC(yyyy + 1, 0, 1));
    return { bucketKey: `${yyyy}`, resetsAt };
  }
  return { bucketKey: 'none', resetsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) };
}

async function resolveUserTier(shopDomain, userId, settings) {
  const userTier = await UserTier.findOne({ shopDomain, userId }).lean();
  if (isUserTierCurrentlyValid(userTier)) return { userTier, tierSlug: userTier.tierSlug, fallback: false };
  return { userTier, tierSlug: settings?.freeFallbackTierSlug || settings?.defaultTierSlug || 'free', fallback: Boolean(userTier), fallbackReason: userTier ? 'invalid_subscription_status_or_expired' : 'no_user_tier' };
}

async function checkEntitlement({ shopDomain, userId, featureKey: rawFeatureKey, quantity = 1, currentValue = null, meta = {}, recordUsage = true }) {
  await seedDefaults(shopDomain);
  const key = featureKey(rawFeatureKey);
  const qty = clampNumber(quantity, 1, 999999, 1);
  const settings = await BillingSettings.findOne({ shopDomain }).lean();
  const resolved = await resolveUserTier(shopDomain, userId, settings);
  const entitlement = await TierEntitlement.findOne({ shopDomain, tierSlug: resolved.tierSlug, featureKey: key }).lean();
  const betaFree = settings?.allowAllFeaturesDuringBeta !== false && !settings?.enforcementEnabled;

  let allowed = betaFree || Boolean(entitlement?.enabled);
  let reason = betaFree ? 'beta_free_access' : entitlement?.enabled ? 'entitled' : 'not_entitled';
  let used = null;
  const limitValue = Number(entitlement?.limitValue || 0);

  if (!betaFree && entitlement?.enabled) {
    if (entitlement.limitType === 'boolean') {
      allowed = Boolean(limitValue > 0);
      if (!allowed) reason = 'not_entitled';
    }

    if (['state_count'].includes(entitlement.limitType)) {
      const stateValue = Number(currentValue ?? qty);
      used = stateValue;
      if (stateValue > limitValue) {
        allowed = entitlement.exceededAction === 'warn';
        reason = 'state_limit_exceeded';
      }
    }

    if (['usage_count', 'soft_usage_count'].includes(entitlement.limitType) && entitlement.limitPeriod !== 'none') {
      const { bucketKey, resetsAt } = bucketForPeriod(entitlement.limitPeriod);
      const filter = { shopDomain, userId, featureKey: key, bucketKey };
      const counter = await UsageCounter.findOneAndUpdate(
        filter,
        { $setOnInsert: { shopDomain, userId, featureKey: key, bucketKey, period: entitlement.limitPeriod, resetsAt }, $inc: { quantity: qty } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();
      used = Number(counter.quantity || 0);
      if (used > limitValue) {
        allowed = entitlement.limitType === 'soft_usage_count' || entitlement.exceededAction === 'warn';
        reason = 'usage_limit_exceeded';
      }
    }
  }

  const action = allowed ? (reason.endsWith('exceeded') ? 'warn' : 'allow') : (entitlement?.exceededAction || 'upgrade');
  const response = { ok: true, allowed, betaFree, reason, tierSlug: resolved.tierSlug, fallback: resolved.fallback, fallbackReason: resolved.fallbackReason || '', entitlement, used, limit: limitValue, action };

  if (recordUsage && (settings?.auditUsageWhileFree !== false || settings?.enforcementEnabled)) {
    await UsageEvent.create({ shopDomain, userId, featureKey: key, tierSlug: resolved.tierSlug, quantity: qty, allowed, auditOnly: betaFree || !settings?.enforcementEnabled, reason, meta });
  }

  return response;
}

module.exports = {
  DEFAULT_FEATURES,
  slugify,
  featureKey,
  publicTier,
  seedDefaults,
  auditChange,
  checkEntitlement,
  resolveUserTier,
  isUserTierCurrentlyValid,
  bucketForPeriod,
  cleanText,
  clampNumber,
};
