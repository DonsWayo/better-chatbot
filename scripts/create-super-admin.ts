#!/usr/bin/env tsx
/**
 * Create (or ensure) the asafe-ai SUPER ADMIN — an email/password account that does
 * NOT use SSO, so an administrator can always log in and manage teams/users in-app.
 *
 * Public email signup is disabled (DISABLE_EMAIL_SIGN_UP=1), so this script force-enables
 * Better Auth signup IN-PROCESS only (it never touches your .env), creates the user with a
 * properly hashed password, and promotes them to role=admin.
 *
 * Usage:
 *   SUPERADMIN_EMAIL=admin@asafe.local SUPERADMIN_PASSWORD='strong-pass' pnpm admin:create
 *   # email/password optional — defaults to admin@asafe.local + a generated password (printed once)
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";

config();

// Force-enable email signup for THIS process only, so signUpEmail works even though
// DISABLE_EMAIL_SIGN_UP=1 in the environment. (Auth config reads these at import time,
// which is why the auth instance is imported dynamically below, after this mutation.)
process.env.DISABLE_EMAIL_SIGN_UP = "";
process.env.DISABLE_SIGN_UP = "";

const email = process.env.SUPERADMIN_EMAIL || "admin@asafe.local";
const name = process.env.SUPERADMIN_NAME || "Super Admin";
let password = process.env.SUPERADMIN_PASSWORD || "";
let generated = false;
if (!password) {
  // url-safe-ish strong password
  password = randomBytes(15).toString("base64").replace(/[+/=]/g, "");
  generated = true;
}

async function main() {
  const { auth } = await import("auth/auth-instance");
  const { USER_ROLES } = await import("app-types/roles");
  const { UserTable } = await import("lib/db/pg/schema.pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { sql } = await import("drizzle-orm");
  const { Pool } = await import("pg");

  const pool = new Pool({ connectionString: process.env.POSTGRES_URL! });
  const db = drizzle(pool);

  const [existing] = await db
    .select()
    .from(UserTable)
    .where(sql`email = ${email}`);

  let userId: string;
  if (existing) {
    console.log(`User ${email} already exists (ID: ${existing.id}).`);
    userId = existing.id;
    if (process.env.SUPERADMIN_PASSWORD) {
      console.log(
        "Note: password NOT changed for an existing user (use Better Auth reset to rotate).",
      );
    }
  } else {
    const result = await auth.api.signUpEmail({
      body: { email, password, name },
      headers: new Headers({ "content-type": "application/json" }),
    });
    if (!result.user) throw new Error("Super admin creation failed");
    userId = result.user.id;
    console.log(`Created super admin ${email} (ID: ${userId}).`);
  }

  // Promote to admin (idempotent).
  await db
    .update(UserTable)
    .set({ role: USER_ROLES.ADMIN })
    .where(sql`id = ${userId}`);
  console.log(`Ensured role=${USER_ROLES.ADMIN} for ${email}.`);

  await pool.end();

  console.log("\n========================================");
  console.log("  ASAFE-AI SUPER ADMIN");
  console.log("========================================");
  console.log(`  email:    ${email}`);
  if (generated) {
    console.log(`  password: ${password}   <-- generated, save it now`);
  } else {
    console.log("  password: (as provided via SUPERADMIN_PASSWORD)");
  }
  console.log("========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to create super admin:", err);
    process.exit(1);
  });
