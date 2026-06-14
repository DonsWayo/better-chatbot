/**
 * Real-DB smoke for the P0 authorization fix: an `edit`-grantee must NOT be able
 * to delete a collaborative document; only owner / admin / `manage` may.
 *
 * Run:
 *   POSTGRES_URL=postgres://asafe:asafe_local_pw@localhost:5433/asafe \
 *     pnpm tsx scripts/smoke-document-manage-gate.ts
 *
 * Creates two throwaway users, a doc owned by editor1, grants editor2 `edit`,
 * asserts editor2.deleteDocument throws Forbidden and the doc still exists; then
 * upgrades editor2 to `manage` and asserts the delete succeeds. Cleans up after.
 */
import { randomUUID } from "node:crypto";
import { pgDb as db } from "../src/lib/db/pg/db.pg";
import { pgDocumentRepository as repo } from "../src/lib/db/pg/repositories/document-repository.pg";
import {
  AsafeDocumentTable,
  EntityGrantTable,
  UserTable,
} from "../src/lib/db/pg/schema.pg";
import { and, eq } from "drizzle-orm";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function main() {
  const editor1 = randomUUID();
  const editor2 = randomUUID();
  const tag = randomUUID().slice(0, 8);

  await db.insert(UserTable).values([
    { id: editor1, name: "editor1", email: `editor1+${tag}@smoke.local` },
    { id: editor2, name: "editor2", email: `editor2+${tag}@smoke.local` },
  ]);
  console.log("seeded two users");

  // editor1 creates a doc.
  const doc = await repo.createDocument({
    userId: editor1,
    title: "Manage-gate smoke",
    visibility: "shared",
  });
  console.log(`created doc ${doc.id} owned by editor1`);

  // Grant editor2 EDIT.
  await db.insert(EntityGrantTable).values({
    entityType: "document",
    entityId: doc.id,
    granteeUserId: editor2,
    capability: "edit",
    grantedBy: editor1,
  });
  console.log("granted editor2 capability=edit");

  // editor2 may EDIT (autosave) ...
  assert(
    await repo.checkAccess(doc.id, editor2, false),
    "edit-grantee HAS edit access (checkAccess readOnly=false)",
  );
  // ... but NOT manage.
  assert(
    !(await repo.checkManageAccess(doc.id, editor2)),
    "edit-grantee LACKS manage access (checkManageAccess)",
  );

  // editor2's delete must be Forbidden and the doc must survive.
  let threw = false;
  try {
    await repo.deleteDocument(doc.id, editor2);
  } catch (e) {
    threw = (e as Error).message === "Forbidden";
  }
  assert(threw, "edit-grantee deleteDocument throws Forbidden");

  // editor2's visibility change must also be Forbidden.
  let visThrew = false;
  try {
    await repo.setVisibility(doc.id, "company", editor2);
  } catch (e) {
    visThrew = (e as Error).message === "Forbidden";
  }
  assert(visThrew, "edit-grantee setVisibility throws Forbidden");

  const stillThere = await repo.getDocumentById(doc.id);
  assert(stillThere !== null, "doc still exists after rejected delete");

  // Upgrade editor2 to MANAGE.
  await db.insert(EntityGrantTable).values({
    entityType: "document",
    entityId: doc.id,
    granteeUserId: editor2,
    capability: "manage",
    grantedBy: editor1,
  });
  console.log("granted editor2 capability=manage");

  assert(
    await repo.checkManageAccess(doc.id, editor2),
    "manage-grantee HAS manage access",
  );

  await repo.deleteDocument(doc.id, editor2);
  const gone = await repo.getDocumentById(doc.id);
  assert(gone === null, "manage-grantee deleteDocument succeeds (doc gone)");

  // Cleanup: grants cascade on user delete; remove the throwaway users.
  await db
    .delete(EntityGrantTable)
    .where(
      and(
        eq(EntityGrantTable.entityType, "document"),
        eq(EntityGrantTable.entityId, doc.id),
      ),
    );
  await db.delete(AsafeDocumentTable).where(eq(AsafeDocumentTable.id, doc.id));
  await db.delete(UserTable).where(eq(UserTable.id, editor1));
  await db.delete(UserTable).where(eq(UserTable.id, editor2));
  console.log("cleaned up");

  console.log("\nSMOKE PASSED");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nSMOKE FAILED:", e);
    process.exit(1);
  });
