#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

const emailArg = process.argv[2];
const passwordArg = process.argv[3];

const email = String(emailArg || process.env.LOOP_ADMIN_EMAIL || "dan@insideloop.life").trim().toLowerCase();
const password = String(passwordArg || process.env.LOOP_ADMIN_BOOTSTRAP_PASSWORD || "");

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

if (!supabaseUrl || !supabaseUrl.startsWith("https://")) {
  fail("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in .env.local");
}

if (!serviceRoleKey || serviceRoleKey.includes("your_real_service_role_key") || serviceRoleKey.includes("YOUR_SERVICE_ROLE_KEY") || !serviceRoleKey.startsWith("eyJ")) {
  fail("Missing real SUPABASE_SERVICE_ROLE_KEY. Copy the service_role JWT from Supabase Project Settings → API Keys. Do not use the placeholder text.");
}

if (!password || password.length < 12) {
  fail('Pass a temporary password of at least 12 characters, e.g. node scripts/bootstrap-admin.mjs dan@insideloop.life "Long-Temp-Password-123!"');
}

const allowlist = String(process.env.LOOP_ADMIN_ALLOWLIST || email)
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

if (!allowlist.includes(email)) {
  fail(`Email ${email} is not in LOOP_ADMIN_ALLOWLIST.`);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function findUserByEmail(targetEmail) {
  let page = 1;
  const perPage = 1000;

  while (page < 50) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    const found = users.find((user) => String(user.email || "").toLowerCase() === targetEmail);
    if (found) return found;

    if (users.length < perPage) return null;
    page += 1;
  }

  return null;
}

async function upsertProfile(user) {
  const profilePayload = {
    id: user.id,
    email,
    role: "owner",
    display_name: "Dan",
    updated_at: new Date().toISOString(),
  };

  const { error: profileError } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" });
  if (profileError) {
    console.warn("⚠️ Could not upsert public.profiles. This is OK if your schema differs:", profileError.message);
  }

  const { error: peopleUpdateError } = await supabase
    .from("people")
    .update({
      account_status: "linked",
      role: "owner",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (peopleUpdateError) {
    console.warn("⚠️ Could not update public.people. This is OK if your schema differs:", peopleUpdateError.message);
  }
}

async function main() {
  console.log("Inside LOOP direct admin bootstrap");
  console.log(`Supabase: ${supabaseUrl}`);
  console.log(`Admin email: ${email}`);

  const existing = await findUserByEmail(email);

  let user;
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      app_metadata: {
        ...(existing.app_metadata || {}),
        role: "owner",
        admin: true,
        super_user: true,
        loop_admin: true,
      },
      user_metadata: {
        ...(existing.user_metadata || {}),
        display_name: existing.user_metadata?.display_name || "Dan",
      },
    });

    if (error) throw error;
    user = data.user;
    console.log("✅ Existing admin user updated.");
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        role: "owner",
        admin: true,
        super_user: true,
        loop_admin: true,
      },
      user_metadata: {
        display_name: "Dan",
      },
    });

    if (error) throw error;
    user = data.user;
    console.log("✅ New admin user created.");
  }

  await upsertProfile(user);

  console.log("\n✅ Admin bootstrap complete.");
  console.log("Now sign in at /login with:");
  console.log(`Email: ${email}`);
  console.log("Password: the temporary password you passed to this script");
  console.log("\nAfter login, change the password from Account settings.");
}

main().catch((error) => {
  console.error("\n❌ Admin bootstrap failed:");
  console.error(error.message || error);
  process.exit(1);
});
