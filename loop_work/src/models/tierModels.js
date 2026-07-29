'use strict';

const mongoose = require('mongoose');

const PERIODS = ['none', 'day', 'week', 'month', 'year'];
const LIMIT_TYPES = ['boolean', 'usage_count', 'state_count', 'soft_usage_count', 'currency', 'text'];
const ACTIONS = ['allow', 'warn', 'block', 'upgrade'];
const SOURCES = ['default', 'stripe', 'manual', 'promo', 'beta', 'staff'];
const STATUSES = ['active', 'trialing', 'past_due', 'cancelled', 'expired'];

const tierSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  isPaid: { type: Boolean, default: false },
  visibleOnSignup: { type: Boolean, default: true },
  defaultSignupTier: { type: Boolean, default: false },
  monthlyPrice: { type: Number, default: 0 },
  annualPrice: { type: Number, default: 0 },
  currency: { type: String, default: 'GBP' },
  stripePriceMonthlyId: { type: String, default: '' },
  stripePriceAnnualId: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });
tierSchema.index({ shopDomain: 1, slug: 1 }, { unique: true });

const entitlementSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  tierSlug: { type: String, required: true, index: true },
  featureKey: { type: String, required: true, index: true },
  featureName: { type: String, default: '' },
  featureGroup: { type: String, default: 'General' },
  description: { type: String, default: '' },
  enabled: { type: Boolean, default: false },
  limitType: { type: String, enum: LIMIT_TYPES, default: 'boolean' },
  limitValue: { type: Number, default: 0 },
  limitPeriod: { type: String, enum: PERIODS, default: 'none' },
  exceededAction: { type: String, enum: ACTIONS, default: 'upgrade' },
  upgradeMessage: { type: String, default: '' },
  auditOnly: { type: Boolean, default: true },
}, { timestamps: true });
entitlementSchema.index({ shopDomain: 1, tierSlug: 1, featureKey: 1 }, { unique: true });

const userTierSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  tierSlug: { type: String, required: true, default: 'free' },
  source: { type: String, enum: SOURCES, default: 'default' },
  status: { type: String, enum: STATUSES, default: 'active' },
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
  manualOverride: { type: Boolean, default: false },
  overrideReason: { type: String, default: '' },
  stripeCustomerId: { type: String, default: '' },
  stripeSubscriptionId: { type: String, default: '' },
}, { timestamps: true });
userTierSchema.index({ shopDomain: 1, userId: 1 }, { unique: true });

const usageEventSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  featureKey: { type: String, required: true, index: true },
  tierSlug: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
  allowed: { type: Boolean, default: true },
  auditOnly: { type: Boolean, default: true },
  reason: { type: String, default: '' },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
});
usageEventSchema.index({ shopDomain: 1, userId: 1, featureKey: 1, createdAt: -1 });

const usageCounterSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  featureKey: { type: String, required: true, index: true },
  bucketKey: { type: String, required: true, index: true },
  period: { type: String, enum: PERIODS, default: 'day' },
  quantity: { type: Number, default: 0 },
  resetsAt: { type: Date, required: true, index: true },
}, { timestamps: true });
usageCounterSchema.index({ shopDomain: 1, userId: 1, featureKey: 1, bucketKey: 1 }, { unique: true });
usageCounterSchema.index({ resetsAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

const billingSettingsSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  billingEnabled: { type: Boolean, default: false },
  enforcementEnabled: { type: Boolean, default: false },
  signupPaymentRequired: { type: Boolean, default: false },
  allowAllFeaturesDuringBeta: { type: Boolean, default: true },
  auditUsageWhileFree: { type: Boolean, default: true },
  defaultTierSlug: { type: String, default: 'free' },
  freeFallbackTierSlug: { type: String, default: 'free' },
  notes: { type: String, default: '27.43 beta mode: all tiers free until enforcement is enabled.' },
}, { timestamps: true });

const entitlementAuditSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  actorId: { type: String, default: '' },
  actorRole: { type: String, default: 'admin' },
  action: { type: String, required: true, index: true },
  targetType: { type: String, default: '' },
  targetKey: { type: String, default: '' },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true },
});
entitlementAuditSchema.index({ shopDomain: 1, createdAt: -1 });

module.exports = {
  PERIODS,
  LIMIT_TYPES,
  ACTIONS,
  SOURCES,
  STATUSES,
  Tier: mongoose.models.Tier || mongoose.model('Tier', tierSchema, 'tiers'),
  TierEntitlement: mongoose.models.TierEntitlement || mongoose.model('TierEntitlement', entitlementSchema, 'tier_entitlements'),
  UserTier: mongoose.models.UserTier || mongoose.model('UserTier', userTierSchema, 'user_tiers'),
  UsageEvent: mongoose.models.UsageEvent || mongoose.model('UsageEvent', usageEventSchema, 'usage_events'),
  UsageCounter: mongoose.models.UsageCounter || mongoose.model('UsageCounter', usageCounterSchema, 'usage_counters'),
  BillingSettings: mongoose.models.BillingSettings || mongoose.model('BillingSettings', billingSettingsSchema, 'billing_settings'),
  EntitlementAudit: mongoose.models.EntitlementAudit || mongoose.model('EntitlementAudit', entitlementAuditSchema, 'entitlement_audit_logs'),
};
