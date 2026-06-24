-- Epics + Tasks — Jira-like work-tracking feature.
-- Epics are top-level containers; tasks are child items under an epic.
-- Cascades ensure deleting an epic removes all of its tasks automatically.
CREATE TABLE IF NOT EXISTS "asafe_epic" (
  "id"          uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "title"       text NOT NULL,
  "description" text,
  "status"      varchar NOT NULL DEFAULT 'backlog'
                CHECK ("status" IN ('backlog', 'in_progress', 'done')),
  "priority"    varchar NOT NULL DEFAULT 'medium'
                CHECK ("priority" IN ('low', 'medium', 'high', 'critical')),
  "labels"      jsonb NOT NULL DEFAULT '[]',
  "team_id"     uuid REFERENCES "asafe_team"("id") ON DELETE SET NULL,
  "owner_id"    uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "visibility"  varchar NOT NULL DEFAULT 'team'
                CHECK ("visibility" IN ('private', 'shared', 'team', 'company')),
  "created_at"  timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "asafe_epic_team_id_status_idx"
  ON "asafe_epic" ("team_id", "status");

CREATE INDEX IF NOT EXISTS "asafe_epic_owner_id_idx"
  ON "asafe_epic" ("owner_id");

CREATE TABLE IF NOT EXISTS "asafe_task" (
  "id"          uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "epic_id"     uuid NOT NULL REFERENCES "asafe_epic"("id") ON DELETE CASCADE,
  "title"       text NOT NULL,
  "description" text,
  "type"        varchar NOT NULL DEFAULT 'task'
                CHECK ("type" IN ('story', 'task', 'bug')),
  "status"      varchar NOT NULL DEFAULT 'todo'
                CHECK ("status" IN ('todo', 'in_progress', 'done')),
  "priority"    varchar NOT NULL DEFAULT 'medium'
                CHECK ("priority" IN ('low', 'medium', 'high', 'critical')),
  "assignee_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "labels"      jsonb NOT NULL DEFAULT '[]',
  "sort_order"  integer NOT NULL DEFAULT 0,
  "team_id"     uuid REFERENCES "asafe_team"("id") ON DELETE SET NULL,
  "created_by"  uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "asafe_task_epic_id_sort_order_idx"
  ON "asafe_task" ("epic_id", "sort_order");

CREATE INDEX IF NOT EXISTS "asafe_task_assignee_id_idx"
  ON "asafe_task" ("assignee_id");
