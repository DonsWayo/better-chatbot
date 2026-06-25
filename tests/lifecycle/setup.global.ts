import { execSync } from "child_process";
import { cancelStaleRuns } from "../helpers/cancel-stale-runs";
import { getUserCount } from "../helpers/clear-users";
import { seedComplianceForTestUsers } from "../helpers/seed-compliance";

async function globalSetup() {
  // Skip seeding if we're running first-user tests
  if (process.env.SKIP_SEEDING === "true") {
    console.log("⏭️  Skipping user seeding for first-user tests");
    return;
  }

  console.log("\n🌱 Global Setup: Checking if users need to be seeded...");
  const userCount = await getUserCount();
  console.log(`📊 Current user count: ${userCount}`);

  if (userCount < 3) {
    console.log("⚠️  Not enough test users, running seed script...");
    try {
      execSync("pnpm test:e2e:seed", { stdio: "inherit" });
      console.log("✅ Test users seeded successfully");
    } catch (error) {
      console.error("❌ Failed to seed test users:", error);
      throw error;
    }
  } else {
    console.log("✅ Test users already exist");
  }

  // Satisfy the compliance gates the app now enforces (email verification +
  // AUP acceptance) so sign-in succeeds and the AUP modal does not intercept
  // clicks during authenticated tests.
  await seedComplianceForTestUsers();

  // Keep the authenticated shell network-idle-safe: a stale non-terminal run
  // activates the Runs sidebar's live Electric long-poll, which prevents
  // `networkidle` and hangs every interactive spec. The seed path cancels these
  // too, but global setup skips the seed when users already exist.
  await cancelStaleRuns();
}

export default globalSetup;
