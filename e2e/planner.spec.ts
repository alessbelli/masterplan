import { expect, test } from "@playwright/test";

// End-to-end proof of the core loop: set targets → plan a recipe → build the
// day → optimize grams → generate the shopping list. Runs against the real
// Worker + local D1 (seeded from the workbook catalog) with a trace recorded.
test("plan a day, optimize macros, and get a shopping list", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "masterplan" })).toBeVisible();

  // Save the default macro targets.
  await page.locator("#save-targets").click();
  await expect(page.locator("#status")).toContainText("targets saved");

  // Search a recipe from the catalog (client-side) and add it to the day.
  await page.locator("#recipe-q").fill("prot");
  const firstAdd = page.locator("#search-results .results div button").first();
  await expect(firstAdd).toBeVisible();
  await firstAdd.click();
  await expect(page.locator("#status")).toContainText("added");
  // Ingredient rows appear immediately (no round-trip).
  await expect(page.locator("#day tbody tr")).not.toHaveCount(0);

  // Optimize grams → the optimizer runs and reports a result.
  await page.locator("#optimize").click();
  await expect(page.locator("#opt-msg")).not.toBeEmpty();
  // Day total row is shown (vs target).
  await expect(page.locator("#day tfoot")).toContainText("Day total");

  // Shopping list rolls up the day's foods.
  await page.locator("#refresh-shop").click();
  await expect(page.locator("#shopping table")).not.toHaveCount(0);
});
