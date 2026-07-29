(function () {
  const API_BASE = '/api/admin/tier-entitlements';

  function getShopParam() {
    const params = new URLSearchParams(window.location.search);
    return params.get('shop') || params.get('shopDomain') || window.__SHOP_DOMAIN__ || '';
  }

  async function api(path, options = {}) {
    const shop = getShopParam();
    const joiner = path.includes('?') ? '&' : '?';
    const res = await fetch(`${API_BASE}${path}${shop ? `${joiner}shop=${encodeURIComponent(shop)}` : ''}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.error || json.message || `Request failed: ${res.status}`);
    return json;
  }

  function money(pence, currency) {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP' }).format((Number(pence || 0) / 100));
  }

  function byFeature(entitlements) {
    return (entitlements || []).reduce((acc, item) => {
      const key = item.featureKey;
      acc[key] = acc[key] || { featureKey: key, featureName: item.featureName, featureGroup: item.featureGroup, rows: [] };
      acc[key].rows.push(item);
      return acc;
    }, {});
  }

  function render(container, state) {
    const settings = state.settings || {};
    const tiers = state.tiers || [];
    const entitlements = state.entitlements || [];
    const grouped = Object.values(byFeature(entitlements));

    container.innerHTML = `
      <section class="tier-admin">
        <div class="tier-admin__hero">
          <div>
            <p class="tier-eyebrow">LOOP v27.43</p>
            <h1>Subscription & Tier Control</h1>
            <p>Build the payment-ready tier engine now, while keeping every feature free during testing.</p>
          </div>
          <div class="tier-status-card">
            <strong>${settings.enforcementEnabled ? 'Enforcement active' : 'Beta/free access'}</strong>
            <span>${settings.allowAllFeaturesDuringBeta ? 'All tiers currently allowed' : 'Tier rules can restrict access'}</span>
          </div>
        </div>

        <div class="tier-grid tier-grid--four">
          ${toggleCard('billingEnabled', 'Billing enabled', settings.billingEnabled, 'Turns subscription/payment logic on.')}
          ${toggleCard('signupPaymentRequired', 'Require payment on signup', settings.signupPaymentRequired, 'Sends paid users to checkout when live.')}
          ${toggleCard('enforcementEnabled', 'Enforce limits', settings.enforcementEnabled, 'Blocks or upgrades when users hit tier limits.')}
          ${toggleCard('allowAllFeaturesDuringBeta', 'Free beta access', settings.allowAllFeaturesDuringBeta, 'Lets everyone use everything while usage is audited.')}
        </div>

        <div class="tier-panel">
          <div class="tier-panel__head">
            <h2>Tiers</h2>
            <button class="tier-btn" data-tier-action="new-tier">Add tier</button>
          </div>
          <div class="tier-cards">
            ${tiers.map((tier) => `
              <article class="tier-card">
                <div class="tier-card__top">
                  <div>
                    <h3>${escapeHtml(tier.name)}</h3>
                    <code>${escapeHtml(tier.slug)}</code>
                  </div>
                  <span class="tier-pill ${tier.isActive ? 'tier-pill--green' : ''}">${tier.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                <p>${escapeHtml(tier.description || 'No description yet.')}</p>
                <div class="tier-price">${money(tier.monthlyPrice, tier.currency)} <span>/ month</span></div>
                <small>${tier.visibleOnSignup ? 'Shown on signup' : 'Hidden from signup'}${tier.defaultSignupTier ? ' • Default' : ''}</small>
              </article>
            `).join('')}
          </div>
        </div>

        <div class="tier-panel">
          <div class="tier-panel__head">
            <h2>Feature entitlements</h2>
            <p>Edit what each tier gets. Limits can be tapered for AI, sharing, market data and exports.</p>
          </div>
          <div class="tier-table-wrap">
            <table class="tier-table">
              <thead>
                <tr><th>Feature</th>${tiers.map((tier) => `<th>${escapeHtml(tier.name)}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${grouped.map((group) => `
                  <tr>
                    <td><strong>${escapeHtml(group.featureName || group.featureKey)}</strong><span>${escapeHtml(group.featureGroup || 'General')}</span></td>
                    ${tiers.map((tier) => {
                      const ent = group.rows.find((row) => row.tierSlug === tier.slug);
                      return `<td>${entitlementCell(ent, tier.slug, group.featureKey)}</td>`;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="tier-panel">
          <div class="tier-panel__head"><h2>Recent usage audit</h2><p>Even while everything is free, checks are recorded here.</p></div>
          <div class="usage-list">
            ${(state.recentUsage || []).map((item) => `
              <div class="usage-row">
                <strong>${escapeHtml(item.featureKey)}</strong>
                <span>${escapeHtml(item.userId)} • ${escapeHtml(item.tierSlug)} • ${escapeHtml(item.reason)}</span>
                <small>${new Date(item.createdAt).toLocaleString()}</small>
              </div>
            `).join('') || '<p>No usage has been audited yet.</p>'}
          </div>
        </div>
      </section>`;

    container.querySelectorAll('[data-setting]').forEach((input) => {
      input.addEventListener('change', async () => {
        const next = { ...settings, [input.dataset.setting]: input.checked };
        await api('/settings', { method: 'PATCH', body: JSON.stringify(next) });
        await load(container);
      });
    });

    container.querySelectorAll('[data-entitlement-toggle]').forEach((input) => {
      input.addEventListener('change', async () => {
        const payload = JSON.parse(input.dataset.entitlementToggle);
        await api(`/entitlements/${payload.tierSlug}/${payload.featureKey}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...payload, enabled: input.checked }),
        });
        await load(container);
      });
    });
  }

  function toggleCard(key, title, enabled, help) {
    return `
      <label class="tier-toggle-card">
        <input type="checkbox" data-setting="${key}" ${enabled ? 'checked' : ''}>
        <span><strong>${title}</strong><small>${help}</small></span>
      </label>`;
  }

  function entitlementCell(ent, tierSlug, featureKey) {
    if (!ent) return '<em>Not configured</em>';
    const payload = escapeAttr(JSON.stringify({
      tierSlug,
      featureKey,
      featureName: ent.featureName,
      featureGroup: ent.featureGroup,
      description: ent.description,
      limitType: ent.limitType,
      limitValue: ent.limitValue,
      limitPeriod: ent.limitPeriod,
      exceededAction: ent.exceededAction,
      upgradeMessage: ent.upgradeMessage,
      auditOnly: ent.auditOnly,
    }));
    const limit = ent.limitType === 'boolean' ? (ent.enabled ? 'On' : 'Off') : `${ent.limitValue || 0}${ent.limitPeriod && ent.limitPeriod !== 'none' ? ` / ${ent.limitPeriod}` : ''}`;
    return `
      <label class="mini-entitlement">
        <input type="checkbox" data-entitlement-toggle="${payload}" ${ent.enabled ? 'checked' : ''}>
        <span>${escapeHtml(limit)}</span>
      </label>`;
  }

  async function load(container) {
    container.innerHTML = '<div class="tier-loading">Loading tier controls…</div>';
    try {
      const state = await api('/summary');
      render(container, state);
    } catch (error) {
      container.innerHTML = `<div class="tier-error"><strong>Tier manager could not load.</strong><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  window.LoopTierEntitlementsAdmin = { load };

  document.addEventListener('DOMContentLoaded', () => {
    const auto = document.querySelector('[data-loop-tier-entitlements]');
    if (auto) load(auto);
  });
})();
