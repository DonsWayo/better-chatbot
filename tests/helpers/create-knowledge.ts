import { Page } from "@playwright/test";

export interface KnowledgeCollection {
  id: string;
  name: string;
  description: string | null;
}

export async function createKnowledgeCollection(
  page: Page,
  data: { name: string; description?: string },
): Promise<KnowledgeCollection | null> {
  const response = await page.request.post("/api/knowledge/collections", {
    data: { name: data.name, description: data.description ?? null },
    failOnStatusCode: false,
  });
  if (!response.ok()) return null;
  const body = await response.json();
  return body.collection ?? null;
}

export async function deleteKnowledgeCollection(
  page: Page,
  id: string,
): Promise<void> {
  await page.request.delete(`/api/knowledge/collections/${id}`, {
    failOnStatusCode: false,
  });
}
