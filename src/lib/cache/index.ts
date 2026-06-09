import { MemoryCache } from "./memory-cache";
import { PgCache } from "./pg-cache";

import { Cache } from "./cache.interface";
import { IS_DEV } from "lib/const";
import logger from "logger";

declare global {
  // eslint-disable-next-line no-var
  var __server__cache__: Cache | undefined;
}

const createCache = () => {
  const redisUrl = process.env.REDIS_URL;

  if (IS_DEV) {
    logger.info("Using MemoryCache for development");
    return new MemoryCache();
  }

  if (redisUrl) {
    // Redis support removed for asafe-ai (Postgres-only deployment).
    // If Redis is needed in the future, re-enable SafeRedisCache here.
    logger.warn("REDIS_URL is set but Redis is not supported in asafe-ai; falling back to PgCache");
  }

  const postgresUrl = process.env.POSTGRES_URL;
  if (postgresUrl) {
    logger.info("Using PgCache (Postgres-backed KV store)");
    return new PgCache();
  }

  logger.warn("No POSTGRES_URL found, falling back to MemoryCache");
  return new MemoryCache();
};

const serverCache = globalThis.__server__cache__ || createCache();

if (IS_DEV) {
  globalThis.__server__cache__ = serverCache;
}

export { serverCache };
