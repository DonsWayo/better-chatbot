import { test as setup, expect } from "@playwright/test";
import * as fs from "node:fs";
import { TEST_USERS } from "../constants/test-users";
import type { Page } from "@playwright/test";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001";

export async function selectModel(
  page: Page,
  providerModel: string,
): Promise<void> {
  const [provider, modelName] = providerModel.split("/");

  if (!provider || !modelName) {
    throw new Error(
      `Invalid model format: ${providerModel}. Expected format: provider/modelName`,
    );
  }

  await page.getByTestId("model-selector-button").click();
  await expect(page.getByTestId("model-selector-popover")).toBeVisible();

  const modelOption = page.getByTestId(`model-option-${provider}-${modelName}`);
  await expect(modelOption).toBeVisible();
  await modelOption.click();

  await expect(page.getByTestId("model-selector-popover")).not.toBeVisible();

  const selectedModel = await page
    .getByTestId("selected-model-name")
    .textContent();
  expect(selectedModel).toBe(modelName);
}

export async function selectDefaultModel(page: Page) {
  const defaultModel = process.env.E2E_DEFAULT_MODEL;
  if (defaultModel) {
    await selectModel(page, defaultModel);
  }
}

async function signInViaApi(
  page: Page,
  { email, password }: { email: string; password: string },
) {
  const res = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status()).toBe(200);
}

setup.beforeAll(async () => {
  fs.mkdirSync("tests/.auth", { recursive: true });
});

setup("create admin auth state", async ({ page }) => {
  console.log("🔐 Creating admin auth state...");
  await signInViaApi(page, {
    email: TEST_USERS.admin.email,
    password: TEST_USERS.admin.password,
  });
  await page.context().storageState({ path: TEST_USERS.admin.authFile });
  expect(fs.existsSync(TEST_USERS.admin.authFile)).toBeTruthy();
});

setup("create editor auth state", async ({ page }) => {
  console.log("🔐 Creating editor auth state...");
  await signInViaApi(page, {
    email: TEST_USERS.editor.email,
    password: TEST_USERS.editor.password,
  });
  await page.context().storageState({ path: TEST_USERS.editor.authFile });
  expect(fs.existsSync(TEST_USERS.editor.authFile)).toBeTruthy();
});

setup("create editor2 auth state", async ({ page }) => {
  console.log("🔐 Creating editor2 auth state...");
  await signInViaApi(page, {
    email: TEST_USERS.editor2.email,
    password: TEST_USERS.editor2.password,
  });
  await page.context().storageState({ path: TEST_USERS.editor2.authFile });
  expect(fs.existsSync(TEST_USERS.editor2.authFile)).toBeTruthy();
});

setup("create regular user auth state", async ({ page }) => {
  console.log("🔐 Creating regular user auth state...");
  await signInViaApi(page, {
    email: TEST_USERS.regular.email,
    password: TEST_USERS.regular.password,
  });
  await page.context().storageState({ path: TEST_USERS.regular.authFile });
  expect(fs.existsSync(TEST_USERS.regular.authFile)).toBeTruthy();
});
