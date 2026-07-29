'use strict';

const { requireSupabaseAdminClient } = require('../services/supabaseAdmin');

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

async function requireSupabaseUser(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const supabase = requireSupabaseAdminClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user?.id) {
      return res.status(401).json({ error: 'Invalid or expired access token.' });
    }

    req.user = {
      id: data.user.id,
      email: data.user.email || '',
      appMetadata: data.user.app_metadata || {},
      userMetadata: data.user.user_metadata || {},
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireSupabaseUser };
