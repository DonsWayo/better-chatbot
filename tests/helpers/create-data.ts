import { Browser, BrowserContext, Page } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

export const createMcpServer = async (
  access: {
    browser?: Browser;
    context?: BrowserContext;
    page?: Page;
  },
  server: {
    name: string;
    config?: {
      command?: string;
      args?: string[];
      [key: string]: any;
    };
    visibility?: "public" | "private";
  },
) => {
  try {
    let page: Page;
    if (!access.browser && !access.page && !access.context) {
      throw new Error("Browser, context, or page is required");
    }
    if (access.page) {
      page = access.page;
    }
    if (access.context) {
      page = await access.context.newPage();
    }
    if (access.browser) {
      const browserContext = await access.browser.newContext({
        storageState: TEST_USERS.admin.authFile,
      });
      page = await browserContext.newPage();
    }
    const postOnce = () =>
      page!.request.post("/api/mcp", {
        headers: { "Content-Type": "application/json" },
        data: {
          name: server.name,
          config: server.config ?? {
            url: "http://localhost:3007/mcp",
          },
          visibility: server.visibility ?? "private",
        },
        timeout: 15000,
      });
    let response = await postOnce();
    if (!response.ok()) {
      const errorBody = await response.text();
      // The fixture MCP server can transiently drop a connection under
      // parallel-worker load ("MCP error -32000: Connection closed") — retry
      // once before failing the test.
      if (errorBody.includes("Connection closed")) {
        response = await postOnce();
      }
      if (!response.ok()) {
        const retryBody = await response.text().catch(() => errorBody);
        throw new Error(
          `Failed to create MCP server: Status ${response.status()} - ${retryBody}`,
        );
      }
    }
    const serverInfo = (await response.json()) as { id: string };
    if (!serverInfo.id) {
      throw new Error("Failed to create MCP server");
    }
    return serverInfo;
  } catch (error) {
    console.error("Error creating MCP server", error);
    throw error;
  }
};
