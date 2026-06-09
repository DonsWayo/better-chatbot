// import { Logger } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";

// class MyLogger implements Logger {
//   logQuery(query: string, params: unknown[]): void {
//     console.log({ query, params });
//   }
// }

// W12: explicit connection pool so EKS pods don't exhaust Postgres max_connections.
// Default max=10 per pod; with HPA max=6 pods that's 60/100 connections.
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL!,
  max: Number(process.env.POSTGRES_POOL_MAX ?? "10"),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const pgDb = drizzlePg(pool, {
  //   logger: new MyLogger(),
});
