/**
 * E2E tests for the Admin Usage page — access control and sidebar visibility.
 *
 * Admins must be able to reach /admin/usage and see the usage sidebar link.
 * Non-admin roles (regular, editor) must be redirected away from /admin/usage.
 * The usage sidebar link must not appear for regular users on the home page.
 *
 * Each test creates its own browser context so the suite is parallel-safe.
 */

import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

test("admin: /admin/usage loads without redirect (URL still contains /admin)", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    storageState: TEST_USERS.admin.authFile,
  });
  const page = await ctx.newPage();

  await page.goto("/admin/usage", { waitUntil: "networkidle" });

  expect(
    page.url(),
    `Admin must stay on /admin/usage but was redirected to ${page.url()}`,
  ).toContain("/admin");

  await ctx.close();
});

test("regular user: /admin/usage redirects away from /admin", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    storageState: TEST_USERS.regular.authFile,
  });
  const page = await ctx.newPage();

  await page.goto("/admin/usage", { waitUntil: "networkidle" });
  await page.waitForLoadState("networkidle");

  const url = page.url();
  expect(
    url,
    `Regular user must be redirected away from /admin/usage but stayed at ${url}`,
  ).not.toContain("/admin");

  await ctx.close();
});

test("editor user: /admin/usage redirects away from /admin", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    storageState: TEST_USERS.editor.authFile,
  });
  const page = await ctx.newPage();

  await page.goto("/admin/usage", { waitUntil: "networkidle" });
  await page.waitForLoadState("networkidle");

  const url = page.url();
  expect(
    url,
    `Editor must be redirected away from /admin/usage but stayed at ${url}`,
  ).not.toContain("/admin");

  await ctx.close();
});

test("admin at /admin: admin-sidebar-link-usage is present", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    storageState: TEST_USERS.admin.authFile,
  });
  const page = await ctx.newPage();

  await page.goto("/admin", { waitUntil: "networkidle" });

  const count = await page
    .getByTestId("admin-sidebar-link-usage")
    .count();
  expect(
    count,
    `Admin must see admin-sidebar-link-usage in the sidebar, found ${count}`,
  ).toBeGreaterThan(0);

  await ctx.close();
});

test("regular user at '/': admin-sidebar-link-usage is absent", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    storageState: TEST_USERS.regular.authFile,
  });
  const page = await ctx.newPage();

  await page.goto("/", { waitUntil: "networkidle" });

  const count = await page
    .getByTestId("admin-sidebar-link-usage")
    .count();
  expect(
    count,
    `Regular user must not see admin-sidebar-link-usage, found ${count}`,
  ).toBe(0);

  await ctx.close();
});
