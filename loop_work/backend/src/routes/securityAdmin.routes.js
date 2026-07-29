'use strict';

const express = require('express');
const { requireSupabaseUser } = require('../middleware/requireSupabaseUser');
const { requireAdminRole } = require('../middleware/requireAdminRole');
const { requireSupabaseAdminClient } = require('../services/supabaseAdmin');
const { hashRequestValue } = require('../services/securityUtils');

const router = express.Router();
router.use(requireSupabaseUser, requireAdminRole);

router.get('/rls-report', async (req, res, next) => {
  try {
    const supabase = requireSupabaseAdminClient();
    const { data, error } = await supabase.rpc('loop_rls_report');
    if (error) throw error;
    return res.json({ ok: true, report: data });
  } catch (error) { next(error); }
});

router.post('/enable-rls', async (req, res, next) => {
  try {
    const supabase = requireSupabaseAdminClient();
    const applyChanges = Boolean(req.body.applyChanges);
    const { data, error } = await supabase.rpc('loop_enable_rls_on_public_tables', { apply_changes: applyChanges });
    if (error) throw error;

    await supabase.from('admin_audit_log').insert({
      actor_user_id: req.user.id,
      actor_email: req.user.email,
      action: applyChanges ? 'security.rls.enabled' : 'security.rls.dry_run',
      target_type: 'database',
      after_value: { applyChanges, rows: data?.length || 0 },
      ip_hash: hashRequestValue(req.ip),
      user_agent_hash: hashRequestValue(req.headers['user-agent']),
    });

    return res.json({ ok: true, applied: applyChanges, result: data });
  } catch (error) { next(error); }
});

router.post('/create-owner-policies', async (req, res, next) => {
  try {
    const supabase = requireSupabaseAdminClient();
    const applyChanges = Boolean(req.body.applyChanges);
    const { data, error } = await supabase.rpc('loop_create_owner_policies', { apply_changes: applyChanges });
    if (error) throw error;

    await supabase.from('admin_audit_log').insert({
      actor_user_id: req.user.id,
      actor_email: req.user.email,
      action: applyChanges ? 'security.owner_policies.created' : 'security.owner_policies.dry_run',
      target_type: 'database',
      after_value: { applyChanges, rows: data?.length || 0 },
      ip_hash: hashRequestValue(req.ip),
      user_agent_hash: hashRequestValue(req.headers['user-agent']),
    });

    return res.json({ ok: true, applied: applyChanges, result: data });
  } catch (error) { next(error); }
});

module.exports = router;
