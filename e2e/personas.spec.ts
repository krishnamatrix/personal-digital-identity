import { expect, test, type Page } from "@playwright/test";

// By default Persona data is fixture-backed (in server memory): these scenarios
// then validate the browser experience and application contract only. Run with
// playwright.supabase.config.ts (PERSONA_STORAGE=supabase, E2E_PERSONA_STORAGE=supabase)
// and the same scenarios exercise the real database through the real UI; the
// database state itself is verified by e2e/personas-supabase.spec.ts.
//
// Signed-in scenarios use the dedicated development test account supplied via
// the environment (same convention as profile-auth.spec.ts). They never write
// to My Identity: the Persona screens only read the profile.

const testEmail = process.env.FOLIOONE_DEV_TEST_EMAIL;
const testPassword = process.env.FOLIOONE_DEV_TEST_PASSWORD;
const skipAuthenticated = process.env.FOLIOONE_SKIP_AUTHENTICATED_E2E === "1";
const run = Date.now().toString(36);
let counter = 0;
const uniqueName = (label: string) => `E2E ${label} ${run}-${++counter}`;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(testEmail!);
  await page.getByLabel("Password").fill(testPassword!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/profile$/);
}

const next = (page: Page) =>
  // exact: the Next.js dev overlay also has a button containing "Next".
  page.getByRole("button", { name: "Next", exact: true });
const polite = (page: Page) =>
  page.locator('[role="status"][aria-live="polite"]');

/** Runs the real four-step flow; returns the editor URL. */
async function createPersona(
  page: Page,
  name: string,
  options: { headline?: string; showProfile?: boolean } = {},
) {
  const headline = options.headline ?? `Headline for ${name}`;
  await page.goto("/personas/new");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await next(page).click();
  await page
    .getByRole("switch", { name: "Include Professional headline" })
    .check();
  await page.getByRole("switch", { name: "Include Summary" }).check();
  if (options.showProfile !== false) {
    await page.getByRole("switch", { name: "Show Profile section" }).check();
  }
  await next(page).click();
  await page.getByLabel("Write for this Persona").first().check();
  await page
    .getByLabel("Professional headline for this Persona")
    .fill(headline);
  await next(page).click();
  await page.getByRole("button", { name: "Create Persona" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  return page.url();
}

const frame = (page: Page) => page.getByTestId("preview-frame");

test.describe("signed out", () => {
  test("Personas is a working destination in the workspace navigation", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Workspace navigation" });
    await expect(nav.getByRole("link", { name: "Personas" })).toHaveAttribute(
      "href",
      "/personas",
    );
    await expect(nav.getByRole("link", { name: "Portfolio" })).toHaveCount(0);
    await expect(nav.locator('a[href="#"]')).toHaveCount(0);
  });

  for (const path of ["/personas", "/personas/new", "/personas/example-id"]) {
    test(`cannot see Personas at ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(
        page.getByText(
          "Sign in with your Folioone account to manage your Personas.",
        ),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
        "href",
        "/login",
      );
      await expect(
        page.getByRole("button", { name: "Create Persona" }),
      ).toHaveCount(0);
    });
  }
});

test.describe("signed in (desktop)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    test.skip(
      skipAuthenticated || !testEmail || !testPassword,
      "Set dedicated development test-user credentials to enable signed-in Persona checks.",
    );
    await signIn(page);
  });

  test("list: navigation, breadcrumb, filters and the fixture notice", async ({
    page,
  }) => {
    await page.goto("/personas");
    await expect(
      page.getByRole("heading", { name: "Personas", level: 1 }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Workspace navigation" })
        .getByRole("link", { name: "Personas" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("My workspace").locator("..")).toContainText(
      "Personas",
    );
    if (process.env.E2E_PERSONA_STORAGE === "supabase") {
      // Real persistence: the fixture notice must NOT be shown.
      await expect(page.getByLabel("Data storage notice")).toHaveCount(0);
    } else {
      await expect(page.getByLabel("Data storage notice")).toContainText(
        /not saved to your database/,
      );
    }
    const filters = page.getByRole("navigation", { name: "Persona filter" });
    await expect(
      filters.getByRole("link", { name: /^Active/ }),
    ).toHaveAttribute("aria-current", "page");
    await filters.getByRole("link", { name: /^Archived/ }).click();
    await expect(page).toHaveURL(/show=archived/);
    await filters.getByRole("link", { name: /^All/ }).click();
    await expect(page).toHaveURL(/show=all/);
  });

  test("create: validation, defaults excluded and hidden, four steps, save, reload", async ({
    page,
  }) => {
    const name = uniqueName("create");
    await page.goto("/personas/new");
    await expect(
      page.getByRole("heading", { name: "Describe it" }),
    ).toBeVisible();

    await next(page).click();
    await expect(
      page.getByRole("heading", { name: "Describe it" }),
    ).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(
      page.getByText("Enter a name for this Persona.").first(),
    ).toBeVisible();

    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Audience (optional)").fill("Investors");
    await next(page).click();
    await expect(
      page.getByRole("heading", { name: "Choose content" }),
    ).toBeVisible();

    // Defaults: every field excluded, every section hidden.
    const includes = page.getByRole("switch", { name: /^Include / });
    for (let i = 0; i < (await includes.count()); i++)
      await expect(includes.nth(i)).not.toBeChecked();
    const shows = page.getByRole("switch", { name: /^Show .* section$/ });
    expect(await shows.count()).toBe(9);
    for (let i = 0; i < 9; i++) await expect(shows.nth(i)).not.toBeChecked();
    await expect(
      page.getByRole("switch", { name: "Highlight Name" }),
    ).toBeDisabled();

    await page
      .getByRole("switch", { name: "Include Professional headline" })
      .check();
    await page
      .getByRole("switch", { name: "Highlight Professional headline" })
      .check();
    await page.getByRole("switch", { name: "Show Profile section" }).check();
    await next(page).click();

    await expect(
      page.getByRole("heading", { name: "Shape presentation" }),
    ).toBeVisible();
    await page.getByLabel("Write for this Persona").first().check();
    const wording = `Wording ${run}`;
    await page
      .getByLabel("Professional headline for this Persona")
      .fill(wording);
    await next(page).click();

    await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
    await expect(
      page.getByText("Only you can see this preview."),
    ).toBeVisible();
    await expect(frame(page)).toContainText(wording);

    // Back keeps what was entered.
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(
      page.getByRole("switch", { name: "Include Professional headline" }),
    ).toBeChecked();
    await next(page).click();
    await next(page).click();

    await page.getByRole("button", { name: "Create Persona" }).click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    const url = page.url();
    await page.reload();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    expect(page.url()).toBe(url);
    await page.goto("/personas");
    await expect(page.getByRole("article", { name })).toBeVisible();
  });

  test("preview: private, accurate, hides hidden sections, shows provenance, no internal IDs", async ({
    page,
  }) => {
    const name = uniqueName("preview");
    const headline = `Headline ${run}-preview`;
    const url = await createPersona(page, name, { headline });
    const id = url.split("/").pop()!;

    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(
      page.getByText("Only you can see this preview."),
    ).toBeVisible();
    await expect(frame(page)).toContainText(headline);
    expect(await frame(page).innerText()).not.toContain(id);

    await page
      .getByRole("switch", { name: "Show where each value comes from" })
      .check();
    await expect(
      frame(page).getByText("Persona-specific version"),
    ).toBeVisible();

    await expect(frame(page)).toHaveAttribute("data-frame", "desktop");
    await page.getByRole("button", { name: "Mobile" }).click();
    await expect(frame(page)).toHaveAttribute("data-frame", "mobile");

    // Hide the Profile section: its included fields must disappear from the preview.
    await page.getByRole("tab", { name: "Content" }).click();
    // Editor switches show the saved state, so click and wait for the result.
    const profileSwitch = page.getByRole("switch", {
      name: "Show Profile section",
    });
    await profileSwitch.click();
    await expect(profileSwitch).not.toBeChecked();
    await expect(polite(page)).toContainText(/Profile section hidden/);
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(frame(page)).not.toContainText(headline);
    await expect(page.getByText(/Profile section is hidden/)).toBeVisible();

    await page.getByRole("tab", { name: "Content" }).click();
    await profileSwitch.click();
    await expect(profileSwitch).toBeChecked();
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(frame(page)).toContainText(headline);
  });

  test("preview reflects My Identity values when they exist (read-only)", async ({
    page,
  }) => {
    const name = uniqueName("identity");
    await createPersona(page, name);
    await page.getByRole("tab", { name: "Presentation" }).click();
    const summary = page.getByRole("group", { name: /Summary/ });
    const identityLine = (
      await summary.getByText(/^My Identity:/).innerText()
    ).replace(/^My Identity:\s*/, "");
    await page.getByRole("tab", { name: "Preview" }).click();
    if (identityLine !== "no value yet") {
      await expect(frame(page)).toContainText(
        identityLine.slice(0, 20).replace("…", ""),
      );
    } else {
      await expect(frame(page)).toContainText("No value in My Identity");
    }
  });

  test("presentation: write for this Persona, intentional blank, reset to My Identity", async ({
    page,
  }) => {
    const name = uniqueName("present");
    await createPersona(page, name, { headline: `Original ${run}` });
    await page.getByRole("tab", { name: "Presentation" }).click();
    const group = page.getByRole("group", { name: /Professional headline/ });
    await expect(group.getByText("Persona-specific version")).toBeVisible();

    const box = group.getByLabel("Professional headline for this Persona");
    await box.fill(`Edited ${run}`);
    await page.getByRole("button", { name: "Save presentation" }).click();
    await expect(polite(page)).toContainText("Presentation saved.");
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(frame(page)).toContainText(`Edited ${run}`);

    await page.getByRole("tab", { name: "Presentation" }).click();
    await box.fill("");
    await expect(
      page.getByText("This field is intentionally blank for this Persona."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save presentation" }).click();
    await expect(group.getByText("Intentionally blank")).toBeVisible();

    await group.getByLabel("Use My Identity value").check();
    await page.getByRole("button", { name: "Save presentation" }).click();
    await expect(
      group.getByText(/From My Identity|No value in My Identity/).first(),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(frame(page)).not.toContainText(`Edited ${run}`);
  });

  test("content: ordering by button, section rename, bulk action confirmation", async ({
    page,
  }) => {
    const name = uniqueName("content");
    await createPersona(page, name);
    await page.getByRole("tab", { name: "Content" }).click();

    await page
      .getByRole("button", { name: "Move Experience section up" })
      .click();
    await expect(polite(page)).toContainText("Experience moved up.");
    await page.getByLabel("Label for Skills").fill("Toolbox");
    await page.getByRole("button", { name: "Save label" }).click();
    await expect(polite(page)).toContainText("Skills label saved.");
    await expect(
      page.getByRole("switch", { name: "Show Toolbox section" }),
    ).toBeVisible();

    const includes = page.getByRole("switch", { name: /^Include / });
    await page.getByRole("button", { name: "Include all" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/fields will change/);
    await expect(dialog).toContainText(/all of it, or none of it/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("switch", { name: "Include Website" }),
    ).not.toBeChecked();

    await page.getByRole("button", { name: "Include all" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Apply to/ })
      .click();
    await expect(polite(page)).toContainText(/updated/);
    for (let i = 0; i < 7; i++) await expect(includes.nth(i)).toBeChecked();
  });

  test("lifecycle: default, duplicate, archive, restore, delete only when archived", async ({
    page,
  }) => {
    const name = uniqueName("life");
    await createPersona(page, name);

    await page.getByRole("button", { name: "Set as default" }).click();
    await expect(page.getByText("Default", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Remove default" }).click();
    await expect(page.getByText("Default", { exact: true })).toHaveCount(0);

    // Active Personas offer no permanent delete.
    await expect(
      page.getByRole("button", { name: /Delete permanently/ }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Duplicate" }).click();
    const copy = `${name} (copy)`;
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create copy" })
      .click();
    await expect(
      page.getByRole("heading", { name: copy, level: 1 }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Archive" }).click();
    const archive = page.getByRole("dialog");
    await expect(archive).toContainText(/does not delete anything/);
    await archive.getByRole("button", { name: "Archive Persona" }).click();
    await expect(page.getByText(/archived and read-only/)).toBeVisible();
    await page.getByRole("tab", { name: "Content" }).click();
    await expect(
      page.getByRole("switch", { name: "Include Name" }),
    ).toBeDisabled();

    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText(/archived and read-only/)).toHaveCount(0);
    await expect(
      page.getByRole("switch", { name: "Include Name" }),
    ).toBeEnabled();
    await expect(page.getByText("Default", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Archive" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Archive Persona" })
      .click();
    await page.getByRole("button", { name: "Delete permanently…" }).click();
    const del = page.getByRole("dialog");
    await expect(del).toContainText("Your My Identity data is not touched.");
    await expect(del).toContainText(/cannot be undone/);
    await del.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("heading", { name: copy, level: 1 }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete permanently…" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete permanently" })
      .click();
    await expect(page).toHaveURL(/\/personas$/);
    await expect(page.getByRole("article", { name: copy })).toHaveCount(0);
    await expect(page.getByRole("article", { name })).toBeVisible();
  });

  test("conflict: reapply keeps unrelated changes made in another tab", async ({
    page,
  }) => {
    const name = uniqueName("conflict");
    const url = await createPersona(page, name);
    await page.getByRole("tab", { name: "Details" }).click();

    const other = await page.context().newPage();
    await other.goto(url);
    await other.getByRole("tab", { name: "Details" }).click();
    await other.getByLabel("Description (optional)").fill(`Remote ${run}`);
    await other.getByLabel("Audience (optional)").fill("Remote audience");
    await other.getByRole("button", { name: "Save details" }).click();
    await expect(other.getByText(/Version 2/)).toBeVisible();

    const renamed = `${name} renamed`;
    await page.getByLabel("Name", { exact: true }).fill(renamed);
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText("Out of date")).toBeVisible();
    // The message is both shown and announced (sr-only live region): assert the shown copy.
    await expect(
      page.getByText(/nothing was overwritten/).last(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reload latest" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Reapply my change" }).click();
    await expect(page.getByText(/Version 3/)).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(renamed);
    await expect(page.getByLabel("Description (optional)")).toHaveValue(
      `Remote ${run}`,
    );
    await expect(page.getByLabel("Audience (optional)")).toHaveValue(
      "Remote audience",
    );
    await other.close();
  });

  test("conflict: reload latest discards unsaved edits", async ({ page }) => {
    const name = uniqueName("reload");
    const url = await createPersona(page, name);
    await page.getByRole("tab", { name: "Details" }).click();
    const other = await page.context().newPage();
    await other.goto(url);
    await other.getByRole("tab", { name: "Details" }).click();
    await other.getByLabel("Description (optional)").fill(`Remote ${run}`);
    await other.getByRole("button", { name: "Save details" }).click();
    await expect(other.getByText(/Version 2/)).toBeVisible();

    await page.getByLabel("Name", { exact: true }).fill("Unsaved rename");
    await page.getByRole("button", { name: "Save details" }).click();
    await page.getByRole("button", { name: "Reload latest" }).click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
    await expect(page.getByLabel("Description (optional)")).toHaveValue(
      `Remote ${run}`,
    );
    await other.close();
  });

  test("keyboard and announcements: switches, buttons and dialogs", async ({
    page,
  }) => {
    const name = uniqueName("keys");
    await createPersona(page, name);
    await page.getByRole("tab", { name: "Content" }).click();

    // Space toggles a switch; the change is announced politely.
    const website = page.getByRole("switch", { name: "Include Website" });
    await website.focus();
    await page.keyboard.press("Space");
    await expect(website).toBeChecked();
    await expect(polite(page)).toContainText("Website included.");

    // Enter activates a move button; focus stays on the control and it is announced.
    const move = page.getByRole("button", { name: "Move Website up" });
    await move.focus();
    await page.keyboard.press("Enter");
    await expect(polite(page)).toContainText("Website moved up.");

    // Tab reaches the next control in order.
    await website.focus();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("switch", { name: "Highlight Website" }),
    ).toBeFocused();

    // Dialogs close on Escape and return focus to the button that opened them.
    const archive = page.getByRole("button", { name: "Archive", exact: true });
    await archive.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(archive).toBeFocused();

    // Errors are announced assertively and keep focus in the form.
    await page.getByRole("tab", { name: "Details" }).click();
    await page.getByLabel("Name", { exact: true }).fill(" ");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(
      page
        .getByTestId("persona-editor")
        .locator('[role="alert"][aria-live="assertive"]'),
    ).toContainText("Enter a name for this Persona.");
  });
});

test.describe("signed in (mobile 390x844)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 390, height: 844 } });
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    test.skip(
      skipAuthenticated || !testEmail || !testPassword,
      "Set dedicated development test-user credentials to enable signed-in Persona checks.",
    );
    await signIn(page);
  });

  const noHorizontalScroll = async (page: Page) =>
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);

  test("navigation works from the menu and nothing scrolls sideways", async ({
    page,
  }) => {
    await page.goto("/personas");
    await noHorizontalScroll(page);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page
        .getByRole("navigation", { name: "Workspace navigation" })
        .getByRole("link", { name: "Personas" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("create flow and editor tabs fit the viewport and stay usable", async ({
    page,
  }) => {
    const name = uniqueName("mobile");
    await page.goto("/personas/new");
    await noHorizontalScroll(page);
    await page.getByLabel("Name", { exact: true }).fill(name);
    await next(page).click();
    await noHorizontalScroll(page);
    // The label column must stay readable (it once collapsed to a few pixels).
    const label = page
      .getByText("Professional headline", { exact: true })
      .first();
    expect((await label.boundingBox())!.width).toBeGreaterThan(90);
    await page
      .getByRole("switch", { name: "Include Professional headline" })
      .check();
    await page.getByRole("switch", { name: "Show Profile section" }).check();
    await next(page).click();
    await next(page).click();
    await noHorizontalScroll(page);
    await page.getByRole("button", { name: "Create Persona" }).click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    for (const tab of ["Details", "Content", "Presentation", "Preview"]) {
      await page.getByRole("tab", { name: tab }).click();
      await noHorizontalScroll(page);
    }
    await page.getByRole("button", { name: "Mobile" }).click();
    await noHorizontalScroll(page);
  });
});

test.describe("signed in: states, titles, editing and session handling", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    test.skip(
      skipAuthenticated || !testEmail || !testPassword,
      "Set dedicated development test-user credentials to enable signed-in Persona checks.",
    );
    await signIn(page);
  });

  test("empty state: first-run guidance when there are no Personas", async ({
    page,
  }) => {
    await page.goto("/personas");
    await expect(
      page.getByRole("heading", { name: "Personas", level: 1 }),
    ).toBeVisible();
    const empty = page.getByRole("heading", {
      name: "Create your first Persona",
    });
    if (!(await empty.isVisible())) {
      // The fixture already holds Personas (a reused dev server): the empty state
      // is covered by the component tests; verify the populated list instead.
      test.info().annotations.push({
        type: "note",
        description: "fixture not empty; empty state not shown",
      });
      await expect(page.getByRole("article").first()).toBeVisible();
      return;
    }
    await expect(
      page.getByText(/does not change My Identity and does not publish/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create a blank Persona" }),
    ).toHaveAttribute("href", "/personas/new");
    for (const name of [
      "Professional",
      "Founder",
      "Academic",
      "Creative",
      "Speaker",
    ]) {
      await expect(
        page.getByRole("link", { name, exact: true }),
      ).toHaveAttribute("href", `/personas/new?starter=${name}`);
    }
    await expect(
      page
        .getByRole("navigation", { name: "Persona filter" })
        .getByRole("link", { name: "Active (0)" }),
    ).toBeVisible();
  });

  test("an unknown or malformed Persona id shows the branded not-found state inside the workspace", async ({
    page,
  }) => {
    for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      await page.goto(`/personas/${id}`);
      // Streaming (the route has a loading state) commits a 200 before the page
      // resolves not-found, so the page is marked noindex instead of returning 404.
      await expect(
        page.locator('meta[name="robots"][content="noindex"]').first(),
      ).toBeAttached();
      await expect(
        page.getByRole("heading", { name: "Persona not found" }),
      ).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Workspace navigation" }),
      ).toBeVisible();
      await expect(page).toHaveTitle("Persona not found — Folioone");
      await expect(page.locator("body")).not.toContainText(
        "This page could not be found",
      );
    }
    await page.getByRole("link", { name: "Back to Personas" }).click();
    await expect(page).toHaveURL(/\/personas$/);
  });

  test("each Persona screen has its own page title", async ({ page }) => {
    await page.goto("/personas");
    await expect(page).toHaveTitle("Personas — Folioone");
    await page.goto("/personas/new");
    await expect(page).toHaveTitle("Create Persona — Folioone");
    const name = uniqueName("title");
    await createPersona(page, name);
    await expect(page).toHaveTitle(`${name} — Folioone`);
    await page.goto("/");
    await expect(page).toHaveTitle(
      "Folioone — Your identity, thoughtfully composed",
    );
  });

  test("details: edit, save, announced, and persisted across a reload and in the list", async ({
    page,
  }) => {
    const name = uniqueName("details");
    const url = await createPersona(page, name);
    await page.getByRole("tab", { name: "Details" }).click();
    await page.getByLabel("Audience (optional)").fill("Angel investors");
    await page.getByLabel("Purpose (optional)").fill("Seed round");
    await page.getByLabel("Description (optional)").fill(`About ${run}`);
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(polite(page)).toContainText("Details saved.");
    await expect(page.getByText(/Version 2/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save details" }),
    ).toBeDisabled();

    await page.goto(url);
    await page.getByRole("tab", { name: "Details" }).click();
    await expect(page.getByLabel("Audience (optional)")).toHaveValue(
      "Angel investors",
    );
    await expect(page.getByLabel("Purpose (optional)")).toHaveValue(
      "Seed round",
    );
    await expect(page.getByLabel("Description (optional)")).toHaveValue(
      `About ${run}`,
    );
    await page.goto("/personas");
    const card = page.getByRole("article", { name });
    await expect(card).toContainText("Angel investors · Seed round");
  });

  test("details: a duplicate name is rejected with a field error and nothing changes", async ({
    page,
  }) => {
    const first = uniqueName("dup-a");
    await createPersona(page, first);
    const second = uniqueName("dup-b");
    await createPersona(page, second);
    await page.getByRole("tab", { name: "Details" }).click();
    await page.getByLabel("Name", { exact: true }).fill(first.toUpperCase());
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(
      page.getByText("An active Persona already uses that name.").first(),
    ).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByText(/Version 1/)).toBeVisible();
  });

  test("a lapsed session shows a way back, keeps the page, and changes nothing", async ({
    page,
    context,
  }) => {
    await createPersona(page, uniqueName("expiry"));
    await page.getByRole("tab", { name: "Content" }).click();
    const summary = page.getByRole("switch", { name: "Include Summary" });
    await expect(summary).toBeChecked(); // createPersona included it
    const headline = page.getByRole("switch", {
      name: "Include Professional headline",
    });
    await context.clearCookies();
    await headline.click();
    await expect(
      page.getByText("You have been signed out").first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Sign in to manage your Personas/).first(),
    ).toBeVisible();
    // The page and its state are untouched; nothing from the failed change shows.
    await expect(headline).toBeChecked();
    const signIn = page.getByRole("link", { name: "Sign in" });
    await expect(signIn).toHaveAttribute("href", "/login");
    await signIn.click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("unsaved edits ask before the tab closes, and saving clears the warning", async ({
    page,
  }) => {
    await createPersona(page, uniqueName("unsaved"));
    // Does the page ask the browser to block an unload? (A real cancelable
    // beforeunload event in the real browser; the dialog itself is browser UI.)
    const asksToStay = () =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
    await page.getByRole("tab", { name: "Details" }).click();
    expect(await asksToStay()).toBe(false);
    await page
      .getByLabel("Description (optional)")
      .fill("Draft that is not saved");
    expect(await asksToStay()).toBe(true);
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(polite(page)).toContainText("Details saved.");
    expect(await asksToStay()).toBe(false);
  });

  test("the dashboard links to the real Personas", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Manage personas" }),
    ).toHaveAttribute("href", "/personas");
    await expect(
      page.getByRole("link", { name: "New persona" }),
    ).toHaveAttribute("href", "/personas/new");
    await page.getByRole("link", { name: "Manage personas" }).click();
    await expect(page).toHaveURL(/\/personas$/);
  });
});

test.describe("signed in (tablet 768x1024)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 768, height: 1024 } });
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    test.skip(
      skipAuthenticated || !testEmail || !testPassword,
      "Set dedicated development test-user credentials to enable signed-in Persona checks.",
    );
    await signIn(page);
  });

  const fits = async (page: Page) =>
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);

  test("field rows keep their controls on one line and nothing scrolls sideways", async ({
    page,
  }) => {
    await page.goto("/personas");
    await fits(page);
    await page.goto("/personas/new");
    await page.getByLabel("Name", { exact: true }).fill(uniqueName("tablet"));
    await next(page).click();
    await fits(page);
    // Highlight and the move buttons are one unit: they sit on the same line and
    // inside the row (at 768px the sidebar leaves ~340px, so the unit may wrap
    // beneath the label, but it never splits apart or spills out).
    const row = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("switch", { name: "Include Name" }) });
    const rowBox = await row.boundingBox();
    const highlight = await page
      .getByRole("switch", { name: "Highlight Name" })
      .boundingBox();
    const moveUp = await page
      .getByRole("button", { name: "Move Name up" })
      .boundingBox();
    const moveDown = await page
      .getByRole("button", { name: "Move Name down" })
      .boundingBox();
    expect(Math.abs(highlight!.y - moveDown!.y)).toBeLessThan(20);
    expect(Math.abs(moveUp!.y - moveDown!.y)).toBeLessThan(5);
    expect(moveDown!.x + moveDown!.width).toBeLessThanOrEqual(
      rowBox!.x + rowBox!.width + 1,
    );
    await next(page).click();
    await next(page).click();
    await page.getByRole("button", { name: "Create Persona" }).click();
    for (const tab of ["Details", "Content", "Presentation", "Preview"]) {
      await page.getByRole("tab", { name: tab }).click();
      await fits(page);
    }
  });
});
