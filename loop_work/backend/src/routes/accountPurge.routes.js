'use strict';

const express = require('express');
const { requireSupabaseUser } = require('../middleware/requireSupabaseUser');
const { requireSupabaseAdminClient } = require('../services/supabaseAdmin');
const { hashRequestValue } = require('../services/securityUtils');

const router = express.Router();

async function removeUserStoragePrefixes(supabase, userId) {
  const buckets = ['avatars', 'uploads', 'food-photos', 'health-photos', 'documents'];
  const removed = [];

  for (const bucket of buckets) {
    try {
      const { data: files } = await supabase.storage.from(bucket).list(`${userId}`, { limit: 1000 });
      if (!files || !files.length) continue;
      const paths = files.map((file) => `${userId}/${file.name}`);
      const { error } = await supabase.storage.from(bucket).remove(paths);
      removed.push({ bucket, count: paths.length, error: error?.message || null });
    } catch (error) {
      removed.push({ bucket, count: 0, error: error.message });
    }
  }

  return removed;
}

router.post('/purge', requireSupabaseUser, async (req, res, next) => {
  try {
    const confirmation = String(req.body.confirmation || '').trim();
    if (confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'To delete all content, confirmation must exactly equal DELETE.' });
    }

    const supabase = requireSupabaseAdminClient();
    const userId = req.user.id;
    const email = req.user.email;

    await supabase.from('admin_audit_log').insert({
      actor_user_id: userId,
      actor_email: email,
      action: 'account.purge.requested',
      target_type: 'auth.users',
      target_id: userId,
      after_value: { self_service: true, domain: 'insideloop.life' },
      ip_hash: hashRequestValue(req.ip),
      user_agent_hash: hashRequestValue(req.headers['user-agent']),
    });

    const { data: purgeSummary, error: purgeError } = await supabase.rpc('loop_purge_user_core_data', {
      target_user_id: userId,
      target_email: email,
    });
    if (purgeError) throw purgeError;

    const storageSummary = await removeUserStoragePrefixes(supabase, userId);

    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      return res.status(500).json({
        ok: false,
        message: 'Core data purge ran, but Auth user deletion failed.',
        purgeSummary,
        storageSummary,
        error: deleteUserError.message,
      });
    }

    return res.json({
      ok: true,
      message: 'Your Inside LOOP account and core data have been deleted.',
      purgeSummary,
      storageSummary,
    });
  } catch (error) { next(error); }
});

module.exports = router;
