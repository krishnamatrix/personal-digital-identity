import { expect, test } from "@playwright/test";

test("workspace shell and dashboard render", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Workspace navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Good morning, Alex." }),
  ).toBeVisible();
  await expect(page.getByText("Your personas")).toBeVisible();
  await expect(page.getByText("A few highlights")).toBeVisible();
});
