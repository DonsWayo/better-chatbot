import { Page } from "@playwright/test";

export async function createPrompt(
  page: Page,
  data: {
    title: string;
    content: string;
    visibility?: "private" | "team" | "org";
  },
): Promise<{ id: string } | null> {
  const response = await page.request.post("/api/prompts", {
    data: {
      title: data.title,
      content: data.content,
      visibility: data.visibility ?? "private",
    },
    failOnStatusCode: false,
  });
  if (!response.ok()) return null;
  const body = await response.json();
  return body.id ? { id: body.id } : null;
}

export async function deletePrompt(page: Page, id: string): Promise<void> {
  await page.request.delete(`/api/prompts/${id}`, { failOnStatusCode: false });
}
