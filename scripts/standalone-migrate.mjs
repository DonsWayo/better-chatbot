// Standalone DB migration entrypoint for the production (Next.js standalone) image.
//
// The runner image has no pnpm/tsx, so `pnpm db:migrate` can't run there. The Helm pre-upgrade
// hook Job invokes `node scripts/standalone-migrate.mjs` instead, so migrations run ONCE per
// release rather than in every replica's boot (ADR-0006). drizzle-orm + pg resolve from the
// standalone node_modules (both are app runtime deps); the migration files are copied into the
// image at src/lib/db/migrations/pg by the Dockerfile.
import { join } from "node:path";
import process from "node:process";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.POSTGRES_URL;
if (!url) {
  console.error("❌ POSTGRES_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const db = drizzle(pool);
const migrationsFolder = join(process.cwd(), "src/lib/db/migrations/pg");

console.log("⏳ Running PostgreSQL migrations from", migrationsFolder);
const start = Date.now();
try {
  await migrate(db, { migrationsFolder });
  console.log(`✅ Migrations completed in ${Date.now() - start} ms`);
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error("❌ Migrations failed", err);
  await pool.end().catch(() => {});
  process.exit(1);
}
