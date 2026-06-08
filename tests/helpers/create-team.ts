import { Page } from "@playwright/test";

export async function createTeam(
  page: Page,
  data: { name: string; description?: string },
): Promise<{ id: string } | null> {
  const response = await page.request.post("/api/admin/teams", {
    data: { name: data.name, description: data.description },
    failOnStatusCode: false,
  });
  if (response.status() === 404) {
    console.warn("No REST API for teams — teams use server actions only");
    return null;
  }
  if (!response.ok()) return null;
  const body = await response.json();
  return body.id ? { id: body.id } : null;
}

export async function deleteTeam(page: Page, id: string): Promise<void> {
  await page.request.delete(`/api/admin/teams/${id}`, {
    failOnStatusCode: false,
  });
}
