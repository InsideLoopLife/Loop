'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('Inside LOOP: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
}

const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function requireSupabaseAdminClient() {
  if (!supabaseAdmin) {
    const error = new Error('Supabase admin client is not configured.');
    error.statusCode = 500;
    throw error;
  }
  return supabaseAdmin;
}

module.exports = { supabaseAdmin, requireSupabaseAdminClient };
