import { expect, test, type Page } from "@playwright/test";

/**
 * M5 website journey against the LOCAL stack: slug, content, theme, preview, publish, public
 * rendering as an anonymous visitor, republish, unpublish and slug change. Creates one throwaway
 * local account. Not part of the staging smoke suite.
 */
test.skip(
  process.env.FOLIOONE_VALIDATE !== "1",
  "Local validation only: creates a throwaway account.",
);

const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const email = `site-${tag}@example.test`;
const password = `Pw-${tag}-correct`;
const slug = `jane-${tag}`;
const slug2 = `jane-new-${tag}`;
const name = `Jane ${tag}`;
const contactEmail = `contact-${tag}@example.test`;

const tabButton = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Website sections" })
    .getByRole("button", { name: new RegExp(`^${name}`) });

test("create, configure, publish, republish, unpublish and re-address a personal website", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);

  // --- Master Identity (the single source of truth) -------------------------------------
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto("/profile");

  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Professional headline").fill("First headline");
  await page.getByLabel("Biography").fill("I make useful things.");
  await page.getByLabel("Contact email").fill(contactEmail);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "saved" }),
  ).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Profile sections" });
  await nav.getByRole("button", { name: "Professional" }).click();
  for (const title of ["Visible Job", "Hidden Job", "Excluded Job"]) {
    await page.getByRole("button", { name: "Add position" }).click();
    await page.getByLabel(/^Title/).fill(title);
    await page.getByLabel(/^Organization/).fill("Acme");
    await page.getByRole("button", { name: "Add position" }).last().click();
  }
  await page.getByRole("button", { name: "Hide Hidden Job" }).click(); // hidden in My Identity
  await page.getByRole("button", { name: "Save employment history" }).click();
  await expect(page.getByText("Employment history saved.")).toBeVisible();

  await nav.getByRole("button", { name: "Skills" }).click();
  await page.getByRole("button", { name: "Add skill" }).click();
  await page.getByLabel(/^Skill\b/).fill("Figma");
  await page.getByRole("button", { name: "Add skill" }).last().click();
  await page.getByRole("button", { name: "Save skills" }).click();
  await expect(page.getByText("Skills saved.")).toBeVisible();

  // --- My Website: navigation, address, availability, reserved words ---------------------
  await page.getByRole("link", { name: "My Website" }).first().click();
  await expect(page).toHaveURL(/\/website$/);
  await expect(page.getByTestId("website-status")).toHaveText("Not created");
  await page.getByRole("button", { name: "Choose your address" }).click();
  await page.getByLabel("Your address").fill("login");
  await expect(page.locator("#slug-status")).toContainText("reserved");
  await page.getByLabel("Your address").fill("Bad Slug!");
  await expect(page.locator("#slug-status")).toContainText("lowercase letters");
  await page.getByLabel("Your address").fill(slug);
  await expect(page.locator("#slug-status")).toContainText("Looks available");
  await page.getByRole("button", { name: "Claim this address" }).click();
  await expect(page.getByTestId("website-status")).toHaveText("Draft");

  // --- Content: hide a section, exclude an entry, opt in to email, reorder ---------------
  await tabButton(page, "Content").click();
  await page.getByRole("switch", { name: "Show Education" }).uncheck();
  await page
    .getByRole("button", { name: "Expand Professional experience" })
    .click();
  await expect(page.getByLabel("Include Hidden Job")).toBeDisabled();
  await page.getByLabel("Include Excluded Job").uncheck();
  await page.getByRole("button", { name: "Expand Contact" }).click();
  await page.getByRole("switch", { name: "Email address" }).check();
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Move Skills and expertise up" })
      .click();

  // --- Design + preview (draft saved, nothing public) -----------------------------------
  await tabButton(page, "Design").click();
  await page.getByRole("radio", { name: /Creative/ }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await tabButton(page, "Preview").click();
  const frame = page.frameLocator('iframe[title="Website preview"]');
  await expect(frame.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(frame.locator('[data-theme="creative"]')).toBeVisible();
  await page.getByRole("button", { name: "Mobile" }).click();
  await expect(page.locator('iframe[title="Website preview"]')).toHaveCSS(
    "width",
    "390px",
  );
  const anonBefore = await browser.newContext({ baseURL });
  const anonPage = await anonBefore.newPage();
  expect(
    (await anonPage.goto(`/${slug}`))!.status(),
    "draft is not public",
  ).toBe(404);

  // --- Publish ---------------------------------------------------------------------------
  await tabButton(page, "Publish").click();
  await page
    .getByRole("button", { name: "Publish", exact: true })
    .last()
    .click();
  await expect(page.getByTestId("website-status")).toHaveText("Published");
  await expect(page.getByTestId("public-url")).toContainText(`/${slug}`);
  await expect(page.getByTestId("qr-code").locator("svg")).toBeVisible();

  // --- Public page, as a signed-out visitor ---------------------------------------------
  const res = await anonPage.goto(`/${slug}`);
  expect(res!.status()).toBe(200);
  await expect(anonPage.locator('[data-theme="creative"]')).toBeVisible();
  await expect(anonPage.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(anonPage.getByText("First headline").first()).toBeVisible();
  const html = await anonPage.content();
  expect(html).toContain("Visible Job");
  expect(html).toContain("Figma");
  expect(html).not.toContain("Hidden Job");
  expect(html).not.toContain("Excluded Job");
  expect(html).not.toContain("University"); // education section was hidden
  expect(html).toContain(`mailto:${contactEmail}`); // opted in
  expect(
    html.indexOf('id="skills"'),
    "skills reordered before experience",
  ).toBeLessThan(html.indexOf('id="experience"'));
  await expect(anonPage).toHaveTitle(new RegExp(`${name}.*First headline`));
  expect(
    await anonPage.locator('meta[property="og:title"]').getAttribute("content"),
  ).toContain(name);
  expect(
    await anonPage.locator('link[rel="canonical"]').getAttribute("href"),
  ).toContain(`/${slug}`);
  expect(
    await anonPage.locator('meta[property="og:image"]').getAttribute("content"),
  ).toContain("opengraph-image");
  const og = await anonPage.request.get(`/${slug}/opengraph-image`);
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
  expect(html).not.toMatch(/Folioone internal|Workspace navigation/);

  // --- Editing Master Identity does not change the published site ------------------------
  await page.goto("/profile");
  await page.getByLabel("Professional headline").fill("Second headline");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "saved" }),
  ).toBeVisible();
  await anonPage.reload();
  await expect(anonPage.getByText("First headline").first()).toBeVisible();
  expect(await anonPage.content()).not.toContain("Second headline");

  await page.goto("/website");
  await expect(page.getByTestId("unpublished-changes")).toBeVisible();
  await page.getByRole("button", { name: "Republish" }).click();
  await expect(page.getByText("Your website is live.")).toBeVisible();
  await anonPage.reload();
  await expect(anonPage.getByText("Second headline").first()).toBeVisible();

  // --- Unpublish: immediately inaccessible ------------------------------------------------
  await page.getByRole("button", { name: "Unpublish" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Unpublish" })
    .click();
  await expect(page.getByTestId("website-status")).toHaveText("Unpublished");
  expect((await anonPage.goto(`/${slug}`))!.status()).toBe(404);
  await expect(anonPage.getByText("This page isn't available")).toBeVisible();

  // --- Republish, then change the slug (confirmation; old address stops working) --------
  await page.getByRole("button", { name: "Publish again" }).click();
  await expect(page.getByTestId("website-status")).toHaveText("Published");
  expect((await anonPage.goto(`/${slug}`))!.status()).toBe(200);
  await tabButton(page, "Address").click();
  await page.getByLabel("Your address").fill(slug2);
  await expect(page.locator("#slug-status")).toContainText("Looks available");
  await page.getByRole("button", { name: "Change address" }).click();
  await expect(page.getByRole("dialog")).toContainText(`/${slug}`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Change address" })
    .click();
  await expect(page.getByText(`Address saved: /${slug2}`)).toBeVisible();
  expect(
    (await anonPage.goto(`/${slug}`))!.status(),
    "old address no longer resolves",
  ).toBe(404);
  expect((await anonPage.goto(`/${slug2}`))!.status()).toBe(200);
  await anonBefore.close();

  // --- A second user cannot take a live address -----------------------------------------
  const other = await browser.newContext({ baseURL });
  const op = await other.newPage();
  await op.goto("/signup");
  await op.getByLabel("Full name").fill("Other Person");
  await op.getByLabel("Email").fill(`other-${tag}@example.test`);
  await op.getByLabel("Password", { exact: true }).fill(password);
  await op.getByLabel("Confirm password").fill(password);
  await op.getByRole("button", { name: "Create account" }).click();
  await expect(op).toHaveURL(/\/onboarding$/);
  await op.goto("/website");
  await op.getByRole("button", { name: "Choose your address" }).click();
  await op.getByLabel("Your address").fill(slug2);
  await expect(op.locator("#slug-status")).toContainText("already taken");
  await expect(
    op.getByRole("button", { name: "Claim this address" }),
  ).toBeDisabled();
  await other.close();
});
