'use strict';

const express = require('express');
const { requireSupabaseAdminClient } = require('../services/supabaseAdmin');
const { requireSupabaseUser } = require('../middleware/requireSupabaseUser');
const { requireAdminRole } = require('../middleware/requireAdminRole');
const { hashAccessCode, generateAccessCode, hashRequestValue } = require('../services/securityUtils');

const router = express.Router();

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: Number(process.env.BETA_GATE_COOKIE_MAX_AGE_MS || 15 * 60 * 1000),
    path: '/',
  };
}

async function findUsableCode(supabase, rawCode, email = '') {
  const codeHash = hashAccessCode(rawCode);
  const { data, error } = await supabase
    .from('beta_access_codes')
    .select('*')
    .eq('code_hash', codeHash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: 'invalid_code' };
  if (data.status !== 'active') return { ok: false, reason: `code_${data.status}` };
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return { ok: false, reason: 'code_expired' };
  if (Number(data.used_count || 0) >= Number(data.max_uses || 1)) return { ok: false, reason: 'code_used' };

  const intended = cleanEmail(data.intended_email);
  const supplied = cleanEmail(email);
  if (intended && supplied && intended !== supplied) return { ok: false, reason: 'wrong_email_for_code' };

  return { ok: true, code: data };
}

router.post('/access/verify', async (req, res, next) => {
  try {
    const supabase = requireSupabaseAdminClient();
    const code = String(req.body.code || '').trim();
    const check = await findUsableCode(supabase, code);
    if (!check.ok) return res.status(403).json({ ok: false, reason: check.reason });

    res.cookie(process.env.BETA_GATE_COOKIE_NAME || 'loop_beta_gate', 'passed', cookieOptions());
    return res.json({ ok: true, message: 'Access code accepted.', appUrl: process.env.APP_URL || 'https://insideloop.life' });
  } catch (error) { next(error); }
});

router.post('/register', async (req, res, next) => {
  try {
    if (String(process.env.PUBLIC_SIGNUPS_ENABLED || 'false') === 'true') {
      return res.status(400).json({ error: 'This endpoint is only for closed beta registration.' });
    }

    const supabase = requireSupabaseAdminClient();
    const email = cleanEmail(req.body.email);
    const password = String(req.body.password || '');
    const displayName = String(req.body.displayName || '').trim().slice(0, 120);
    const code = String(req.body.code || '').trim();

    if (!email) return res.status(400).json({ error: 'Valid email is required.' });
    if (password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters.' });

    const check = await findUsableCode(supabase, code, email);
    if (!check.ok) return res.status(403).json({ ok: false, reason: check.reason });

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { display_name: displayName, beta_access_code_id: check.code.id },
      app_metadata: { role: 'beta_tester', beta: true, signup_domain: 'insideloop.life' },
    });
    if (createError) throw createError;

    await supabase.from('beta_access_codes').update({
      used_count: Number(check.code.used_count || 0) + 1,
      last_used_at: new Date().toISOString(),
    }).eq('id', check.code.id);

    await supabase.from('beta_access_code_redemptions').insert({
      code_id: check.code.id,
      user_id: created.user.id,
      email,
      ip_hash: hashRequestValue(req.ip),
      user_agent_hash: hashRequestValue(req.headers['user-agent']),
    });

    await supabase.from('profiles').upsert({
      id: created.user.id,
      email,
      display_name: displayName || email.split('@')[0],
      role: 'beta_tester',
      beta_access_code_id: check.code.id,
      updated_at: new Date().toISOString(),
    });

    return res.json({ ok: true, userId: created.user.id, message: 'Beta account created. Please log in.' });
  } catch (error) { next(error); }
});

router.post('/admin/access-codes', requireSupabaseUser, requireAdminRole, async (req, res, next) => {
  try {
    const supabase = requireSupabaseAdminClient();
    const count = Math.max(1, Math.min(100, Number(req.body.count || 1)));
    const maxUses = Math.max(1, Math.min(100, Number(req.body.maxUses || 1)));
    const label = String(req.body.label || 'Closed beta invite').slice(0, 120);
    const intendedEmail = cleanEmail(req.body.email);
    const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt).toISOString() : null;

    const rawCodes = [];
    const rows = [];
    for (let i = 0; i < count; i += 1) {
      const code = generateAccessCode();
      rawCodes.push(code);
      rows.push({
        code_hash: hashAccessCode(code),
        label,
        intended_email: intendedEmail || null,
        max_uses: maxUses,
        expires_at: expiresAt,
        created_by: req.user.id,
        metadata: { created_from: 'inside_loop_admin', domain: 'insideloop.life' },
      });
    }

    const { data, error } = await supabase.from('beta_access_codes').insert(rows).select('id,label,intended_email,max_uses,expires_at,created_at');
    if (error) throw error;

    await supabase.from('admin_audit_log').insert({
      actor_user_id: req.user.id,
      actor_email: req.user.email,
      action: 'beta_access_codes.created',
      target_type: 'beta_access_codes',
      after_value: { count, label, intendedEmail, expiresAt },
      ip_hash: hashRequestValue(req.ip),
      user_agent_hash: hashRequestValue(req.headers['user-agent']),
    });

    return res.json({
      ok: true,
      codes: data.map((row, index) => ({ ...row, raw_code_once: rawCodes[index] })),
      warning: 'Raw codes are only returned once. Store/share them safely.',
    });
  } catch (error) { next(error); }
});

router.post('/admin/invite-email', requireSupabaseUser, requireAdminRole, async (req, res, next) => {
  try {
    const supabase = requireSupabaseAdminClient();
    const email = cleanEmail(req.body.email);
    if (!email) return res.status(400).json({ error: 'Valid email is required.' });

    const redirectTo = `${process.env.APP_URL || 'https://insideloop.life'}/auth/callback`;
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { invited_from: 'inside_loop_admin', domain: 'insideloop.life' },
    });
    if (error) throw error;

    await supabase.from('admin_audit_log').insert({
      actor_user_id: req.user.id,
      actor_email: req.user.email,
      action: 'supabase_invite.sent',
      target_type: 'auth.users',
      target_id: email,
      after_value: { email, redirectTo },
      ip_hash: hashRequestValue(req.ip),
      user_agent_hash: hashRequestValue(req.headers['user-agent']),
    });

    return res.json({ ok: true, data });
  } catch (error) { next(error); }
});

module.exports = router;
