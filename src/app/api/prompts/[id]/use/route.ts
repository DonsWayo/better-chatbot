import { getSession } from "lib/auth/server";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import { AsafePromptTemplateTable } from "@/lib/db/pg/schema.pg";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [existing] = await db
    .select({ id: AsafePromptTemplateTable.id })
    .from(AsafePromptTemplateTable)
    .where(eq(AsafePromptTemplateTable.id, id));

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(AsafePromptTemplateTable)
    .set({ usageCount: sql`${AsafePromptTemplateTable.usageCount} + 1` })
    .where(eq(AsafePromptTemplateTable.id, id));

  return NextResponse.json({ ok: true });
}
