import { expect, test, type Page } from "@playwright/test";

/**
 * POST-DEPLOYMENT SMOKE SUITE. Runs against a deployed URL (SMOKE_BASE_URL) with
 * two DEDICATED test accounts. Safety rules:
 *   - it creates exactly one Persona, named "SMOKE <run tag>", and nothing else;
 *   - its cleanup archives and deletes only that Persona (looked up by the URL
 *     captured at creation), never by pattern, never anyone else's data;
 *   - it does not change either account's profile.
 * `pnpm validate` also runs it against the local stack, so the suite itself is
 * verified before it is ever pointed at staging.
 */
const userA = {
  email: process.env.SMOKE_USER_A_EMAIL,
  password: process.env.SMOKE_USER_A_PASSWORD,
};
const userB = {
  email: process.env.SMOKE_USER_B_EMAIL,
  password: process.env.SMOKE_USER_B_PASSWORD,
};
const configured = Boolean(
  userA.email && userA.password && userB.email && userB.password,
);
const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const personaName = `SMOKE ${tag}`;
let personaUrl = "";

async function signIn(page: Page, user: typeof userA) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email!);
  await page.getByLabel("Password").fill(user.password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/profile$/);
}

test.describe.configure({ mode: "serial" });

test.describe("staging smoke", () => {
  test.setTimeout(90_000);
  test.skip(
    !configured,
    "Set SMOKE_USER_A_* and SMOKE_USER_B_* (dedicated staging test accounts).",
  );

  test.afterAll(async ({ browser }) => {
    if (!personaUrl) return;
    // Remove ONLY the Persona this run created.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signIn(page, userA);
      await page.goto(personaUrl);
      await expect(
        page.getByRole("heading", { name: personaName, level: 1 }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Archive" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Archive Persona" })
        .click();
      await page.getByRole("button", { name: "Delete permanently…" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete permanently" })
        .click();
      await expect(page).toHaveURL(/\/personas$/);
      await expect(
        page.getByRole("article", { name: personaName }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("1. health endpoint answers", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("2. the dedicated test user can sign in", async ({ page }) => {
    await signIn(page, userA);
  });

  test("3. account and profile load from the database (no unavailable state)", async ({
    page,
  }) => {
    await signIn(page, userA);
    await expect(page.getByLabel("Professional headline")).toBeVisible();
    await expect(page.getByText(/could not load|unavailable/i)).toHaveCount(0);
  });

  test("4. the Persona list loads", async ({ page }) => {
    await signIn(page, userA);
    await page.goto("/personas");
    await expect(
      page.getByRole("heading", { name: "Personas", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/We could not load your Personas/)).toHaveCount(
      0,
    );
    // Supabase-backed storage: the fixture notice must not be shown.
    await expect(page.getByLabel("Data storage notice")).toHaveCount(0);
  });

  test("5. a tagged Persona can be created (also creates the account anchor if absent)", async ({
    page,
  }) => {
    await signIn(page, userA);
    await page.goto("/personas/new");
    await page.getByLabel("Name", { exact: true }).fill(personaName);
    for (let i = 0; i < 3; i++)
      await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Create Persona" }).click();
    await expect(
      page.getByRole("heading", { name: personaName, level: 1 }),
    ).toBeVisible();
    personaUrl = page.url();
    expect(personaUrl).toMatch(/\/personas\/[0-9a-f-]{36}/);
  });

  test("6. an update persists across a reload and shows in the list", async ({
    page,
  }) => {
    test.skip(!personaUrl, "No Persona was created in step 5");
    await signIn(page, userA);
    await page.goto(personaUrl);
    await page.getByRole("tab", { name: "Details" }).click();
    await page.getByLabel("Description (optional)").fill(`smoke ${tag}`);
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText(/Version 2/)).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Details" }).click();
    await expect(page.getByLabel("Description (optional)")).toHaveValue(
      `smoke ${tag}`,
    );
    await page.goto("/personas");
    await expect(
      page.getByRole("article", { name: personaName }),
    ).toBeVisible();
  });

  test("7. a second user cannot see or open it", async ({ browser }) => {
    test.skip(!personaUrl, "No Persona was created in step 5");
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signIn(page, userB);
      await page.goto(personaUrl);
      await expect(page).toHaveTitle(/Persona not found/);
      await expect(
        page.getByRole("heading", { name: personaName, level: 1 }),
      ).toHaveCount(0);
      await page.goto("/personas?show=all");
      await expect(
        page.getByRole("article", { name: personaName }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("8. signing out closes the protected routes", async ({ page }) => {
    await signIn(page, userA);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/personas");
    await expect(
      page.getByText(
        "Sign in with your Folioone account to manage your Personas.",
      ),
    ).toBeVisible();
    await page.goto("/profile");
    await expect(
      page.getByText(
        "Sign in with your Folioone account to manage your private identity profile.",
      ),
    ).toBeVisible();
    if (personaUrl) {
      await page.goto(personaUrl);
      await expect(page.getByText(/Sign in/).first()).toBeVisible();
    }
  });
});
