import { expect, test, type Page } from "@playwright/test";
import { setLocalAdmin } from "../tests/helpers/local-psql";

/**
 * Folio Designer (M14) against the LOCAL stack: a platform admin creates a website design by
 * hand (no AI needed), changes a colour, saves a version and publishes it; a person on the Free
 * plan picks it in My Website and publishes; the public page renders the pinned design; a newer
 * version does not change the live site until the owner republishes. Screenshots of each key
 * screen go to test-results/local/designer/.
 */
test.skip(
  process.env.FOLIOONE_VALIDATE !== "1" ||
    !process.env.FOLIOONE_LOCAL_DB_CONTAINER,
  "Local validation only: creates throwaway accounts and grants the admin role locally.",
);

const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const adminEmail = `fd-admin-${tag}@example.test`;
const ownerEmail = `fd-owner-${tag}@example.test`;
const password = `Pw-${tag}-correct`;
const slug = `harbour-site-${tag}`;
const label = `Harbour ${tag}`;
const shot = (page: Page, name: string) =>
  page.screenshot({
    path: `test-results/local/designer/${name}.png`,
    fullPage: true,
  });

async function signUp(page: Page, name: string, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

const accentOf = (page: Page, id: string) =>
  page
    .locator(`[data-theme="${id}"]`)
    .first()
    .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--t-accent"));

test("an admin designs and publishes a website design; a Free owner uses it", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const adminCtx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const admin = await adminCtx.newPage();

  // --- Admin: not an admin yet (no such page), then granted the role -------------------
  await signUp(admin, "Ada Designer", adminEmail);
  expect((await admin.goto("/admin/designs"))!.status()).toBe(404);
  setLocalAdmin(adminEmail, true);
  await admin.goto("/admin/designs");
  await expect(
    admin.getByRole("heading", { name: "Folio Designer", level: 1 }),
  ).toBeVisible();
  await expect(
    admin
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("link", { name: "Folio Designer" }),
  ).toBeVisible();
  await shot(admin, "01-designer-list");

  // --- Create a draft by hand, change the accent, save version 2, publish --------------
  await admin.getByLabel(/^Name/).fill(label);
  await admin.getByRole("combobox", { name: "Plan" }).click();
  await admin.getByRole("option", { name: "Free for everyone" }).click();
  await admin.getByRole("button", { name: "Create draft" }).click();
  await expect(admin).toHaveURL(
    /\/admin\/designs\/website\/harbour-[a-z0-9-]+$/,
  );
  const designId = admin.url().split("/").pop()!;
  await expect(admin.getByTestId("design-status")).toHaveText("Draft");
  await expect(admin.getByTestId("design-checks")).toContainText("passes");

  // An unreadable colour is caught before it can be published.
  await admin.getByLabel("Main text hex", { exact: true }).fill("#eeeeee");
  await expect(admin.getByTestId("design-checks")).toContainText(
    "Not readable enough",
  );
  await shot(admin, "02-editor-contrast-problem");
  await admin.getByRole("button", { name: "Undo changes" }).click();
  await expect(admin.getByTestId("design-checks")).toContainText("passes");

  await admin.getByLabel("Accent hex", { exact: true }).fill("#1f4d3a");
  await admin.getByRole("button", { name: "Save as new version" }).click();
  await expect(admin.getByRole("status")).toContainText("Saved as version 2");
  await expect(admin.getByTestId("design-version")).toHaveCount(2);
  await admin.getByRole("button", { name: "Publish version 2" }).click();
  await expect(admin.getByRole("status")).toContainText("Version 2 is live");
  await expect(admin.getByTestId("design-status")).toHaveText("Published");
  await shot(admin, "03-editor-published");

  // Full-page preview of the saved version (sample person).
  const preview = await adminCtx.newPage();
  await preview.goto(`/admin/designs/website/${designId}/preview?v=2`);
  await expect(preview.getByText("Jordan Avery").first()).toBeVisible();
  expect(await accentOf(preview, designId)).toBe("#1f4d3a");
  await shot(preview, "04-full-preview-sample");
  await preview.close();

  // --- Owner (Free): profile, address, choose the new design, publish ------------------
  const ownerCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const owner = await ownerCtx.newPage();
  await signUp(owner, "Jordan Owner", ownerEmail);
  expect((await owner.goto("/admin/designs"))!.status()).toBe(404);
  await owner.goto("/profile");
  await owner.getByLabel("Display name").fill("Jordan Owner");
  await owner.getByLabel("Biography").fill("I design calm software.");
  await owner.getByRole("button", { name: "Save profile" }).click();
  await expect(
    owner.getByRole("status").filter({ hasText: "saved" }),
  ).toBeVisible();
  await owner.goto("/website");
  await owner.getByRole("button", { name: "Choose your address" }).click();
  await owner.getByLabel("Your address").fill(slug);
  await owner.getByRole("button", { name: "Claim this address" }).click();
  await expect(owner.getByTestId("website-status")).toHaveText("Draft");
  const tab = (name: string) =>
    owner
      .getByRole("navigation", { name: "Website sections" })
      .getByRole("button", { name: new RegExp(`^${name}`) });
  await tab("Design").click();
  const choice = owner.getByRole("radio", { name: new RegExp(label) });
  await expect(choice).toBeVisible();
  await choice.click();
  await shot(owner, "05-owner-design-tab");
  await owner.getByRole("button", { name: "Save draft" }).click();
  await expect(owner.getByText("Draft saved.")).toBeVisible();
  await tab("Publish").click();
  await owner
    .getByRole("button", { name: "Publish", exact: true })
    .last()
    .click();
  await expect(owner.getByTestId("website-status")).toHaveText("Published");

  // --- The public page renders the pinned design ---------------------------------------
  const anon = await (await browser.newContext()).newPage();
  expect((await anon.goto(`/${slug}`))!.status()).toBe(200);
  await expect(
    anon.getByRole("heading", { level: 1, name: "Jordan Owner" }),
  ).toBeVisible();
  expect(await accentOf(anon, designId)).toBe("#1f4d3a");
  await shot(anon, "06-public-site");

  // --- A newer version does not change the live site until the owner republishes -------
  await admin.getByLabel("Accent hex", { exact: true }).fill("#7a2e2a");
  await admin.getByRole("button", { name: "Save as new version" }).click();
  await expect(admin.getByRole("status")).toContainText("Saved as version 3");
  await admin.getByRole("button", { name: "Make version 3 live" }).click();
  await expect(admin.getByRole("status")).toContainText("Version 3 is live");
  await anon.reload();
  expect(await accentOf(anon, designId)).toBe("#1f4d3a");
  await owner.goto("/website");
  await tab("Publish").click();
  await owner.getByRole("button", { name: "Republish" }).first().click();
  await expect(owner.getByText("Your website is live.")).toBeVisible();
  await anon.reload();
  expect(await accentOf(anon, designId)).toBe("#7a2e2a");
  await shot(anon, "07-public-site-republished");

  // --- Retired: no longer offered to others, kept by the owner -------------------------
  await admin.getByRole("button", { name: "Retire" }).click();
  await admin.getByRole("button", { name: "Retire design" }).click();
  await expect(admin.getByTestId("design-status")).toHaveText("Retired");
  await anon.reload();
  expect(await accentOf(anon, designId)).toBe("#7a2e2a");
  await shot(admin, "08-editor-retired");

  await adminCtx.close();
  await ownerCtx.close();
});
