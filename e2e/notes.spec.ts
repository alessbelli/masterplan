import { expect, test } from "@playwright/test";

// End-to-end proof: load the app, add a note, see it persist via the D1-backed API.
test("a visitor can add a note and see it appear", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "masterplan" })).toBeVisible();

  const unique = `hello from e2e ${Date.now()}`;
  await page.getByPlaceholder("Add a note…").fill(unique);
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByRole("listitem").filter({ hasText: unique })).toBeVisible();

  // Survives a reload => it was actually persisted in D1, not just in the DOM.
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: unique })).toBeVisible();
});
