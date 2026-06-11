import { sql } from "drizzle-orm";
import { pgDb } from "../../src/lib/db/pg/db.pg";
import {
  AsafeAupAcceptanceTable,
  UserTable,
} from "../../src/lib/db/pg/schema.pg";
import { TEST_EMAIL_DOMAIN } from "../constants/test-users";

/**
 * Mirror of `CURRENT_AUP_VERSION` in src/lib/compliance/aup.ts. That module is
 * marked `server-only`, so it cannot be imported into the Playwright global
 * setup (plain Node). Keep this value in sync if the policy version is bumped.
 */
const CURRENT_AUP_VERSION = "1.0";

/**
 * Ensure every seeded test user satisfies the compliance gates that the app now
 * enforces on real users:
 *
 *  1. `email_verified = true` — sign-in returns 403 otherwise (required since the
 *     email-verification gate was added).
 *  2. A current-version row in `asafe_aup_acceptance` — otherwise the Acceptable
 *     Use Policy modal (EU AI Act Article 50 gate) renders on first authenticated
 *     page load and intercepts clicks / blocks `waitForURL`.
 *
 * Run from global setup so the whole suite starts from a compliant baseline.
 */
export async function seedComplianceForTestUsers(): Promise<void> {
  // 1. email_verified for every test-seed user.
  await pgDb
    .update(UserTable)
    .set({ emailVerified: true })
    .where(sql`${UserTable.email} LIKE ${"%" + TEST_EMAIL_DOMAIN}`);

  // 2. Current-version AUP acceptance for every test-seed user.
  const users = await pgDb
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(sql`${UserTable.email} LIKE ${"%" + TEST_EMAIL_DOMAIN}`);

  if (users.length === 0) return;

  await pgDb
    .insert(AsafeAupAcceptanceTable)
    .values(
      users.map((u) => ({
        userId: u.id,
        aupVersion: CURRENT_AUP_VERSION,
      })),
    )
    .onConflictDoNothing();

  console.log(
    `✅ Compliance seeded: ${users.length} test users (email_verified + AUP v${CURRENT_AUP_VERSION})`,
  );
}
