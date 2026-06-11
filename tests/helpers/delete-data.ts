import { Browser, BrowserContext, Page } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

export const deleteMcpServer = async (
  access: {
    browser?: Browser;
    context?: BrowserContext;
    page?: Page;
  },
  serverId: string,
) => {
  if (!access.browser && !access.page && !access.context) {
    throw new Error("Browser, context, or page is required");
  }

  // Only close resources WE create here. The caller owns whatever it passed in
  // (especially the shared `browser` fixture — closing it would tear down the
  // whole test and break every later step with "browser has been closed").
  let createdContext: BrowserContext | undefined;
  let page: Page;
  if (access.page) {
    page = access.page;
  } else if (access.context) {
    page = await access.context.newPage();
  } else {
    createdContext = await access.browser!.newContext({
      storageState: TEST_USERS.admin.authFile,
    });
    page = await createdContext.newPage();
  }

  try {
    const response = await page.request.delete(`/api/mcp/${serverId}`);
    if (!response.ok()) {
      const responseText = await response.text();
      // If the server is already gone (404), that's fine during cleanup.
      if (response.status() === 404 || responseText.includes("not found")) {
        return;
      }
      console.error(
        "Failed to delete MCP server",
        response.status(),
        responseText,
      );
      throw new Error("Failed to delete MCP server");
    }
  } finally {
    await createdContext?.close();
  }
};
