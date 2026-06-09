import "server-only";

import { pgDb } from "lib/db/pg/db.pg";
import { AsafeFeatureFlagTable } from "lib/db/pg/schema.pg";
import { _resetKillSwitchCache } from "lib/observability/kill-switch";

export interface FeatureFlag {
  name: string;
  enabled: boolean;
}

export async function upsertFeatureFlag(name: string, enabled: boolean): Promise<void> {
  await pgDb
    .insert(AsafeFeatureFlagTable)
    .values({ name, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: AsafeFeatureFlagTable.name,
      set: { enabled, updatedAt: new Date() },
    });

  if (name === "kill_switch") {
    _resetKillSwitchCache();
  }
}
