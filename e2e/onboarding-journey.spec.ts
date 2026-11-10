import { expect, test } from "@playwright/test";

/**
 * M4 first-time user journey against the LOCAL stack (email confirmation is off there, so
 * sign-up opens a session immediately). It creates one throwaway local account per run; it is
 * deliberately not part of the staging smoke suite and refuses to run without FOLIOONE_VALIDATE.
 */
test.skip(
  process.env.FOLIOONE_VALIDATE !== "1",
  "Local validation only: creates a throwaway account.",
);

const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const email = `journey-${tag}@example.test`;
const password = `Pw-${tag}-correct`;

test("register, onboard, build the Master Identity, sign out and find it persisted", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // 1. Register -> onboarding.
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Journey Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("heading", { name: "Welcome to Folioone" }),
  ).toBeVisible();

  // 2. Onboarding: welcome, basics (name pre-filled), then resume after a reload.
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("Journey Tester");
  await page.getByLabel("Professional headline").fill("Journey headline");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 3 of 7")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Step 3 of 7")).toBeVisible(); // progress was saved

  await page.getByLabel("Current designation").fill("Engineer");
  await page.getByLabel("Current organization").fill("Acme");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip" }).click(); // image
  await page.getByLabel("Location").fill("Lisbon");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Build my personal brand").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Review and finish" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Finish and open my workspace" })
    .click();
  await expect(page).toHaveURL(/\/profile\?welcome=1$/);
  await expect(page.getByText("You are all set.")).toBeVisible();

  // 3. Personal + professional edits persist.
  await expect(page.getByLabel("Professional headline")).toHaveValue(
    "Journey headline",
  );
  await page.getByLabel("Biography").fill("I build careful software.");
  await expect(page.getByText("Unsaved changes").first()).toBeVisible();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Your private profile has been saved." }),
  ).toBeVisible();

  // 4. Education, skills, project, social link.
  const nav = page.getByRole("navigation", { name: "Profile sections" });
  await nav.getByRole("button", { name: "Education" }).click();
  await page.getByRole("button", { name: "Add education entry" }).click();
  await page.getByLabel("Institution").fill("University of Testing");
  await page.getByLabel("Qualification").fill("BSc");
  await page
    .getByRole("button", { name: "Add education entry" })
    .last()
    .click();
  await page.getByRole("button", { name: "Save education" }).click();
  await expect(page.getByText("Education saved.")).toBeVisible();

  await nav.getByRole("button", { name: "Skills" }).click();
  await page.getByRole("button", { name: "Add skill" }).click();
  await page.getByLabel(/^Skill\b/).fill("TypeScript");
  await page.getByRole("button", { name: "Add skill" }).last().click();
  await page.getByRole("button", { name: "Save skills" }).click();
  await expect(page.getByText("Skills saved.")).toBeVisible();

  await nav.getByRole("button", { name: "Projects" }).click();
  await page.getByRole("button", { name: "Add project" }).click();
  await page.getByLabel("Project name").fill("Folioone");
  await page.getByLabel("Technologies").fill("Next.js, Supabase");
  await page.getByRole("button", { name: "Add project" }).last().click();
  await page.getByRole("button", { name: "Save projects" }).click();
  await expect(page.getByText("Projects saved.")).toBeVisible();

  await nav.getByRole("button", { name: "Social & Web" }).click();
  await page.getByRole("button", { name: "Add link" }).click();
  await page.getByLabel("Platform").selectOption("github");
  await page.getByLabel(/^URL\b/).fill("https://github.com/journey-tester");
  await page.getByRole("button", { name: "Add link" }).last().click();
  await page
    .getByRole("button", { name: "Save social & web profiles" })
    .click();
  await expect(page.getByText("Social & web profiles saved.")).toBeVisible();

  // 5. Sign out, sign back in, everything is still there; preview shows it.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel("Biography")).toHaveValue(
    "I build careful software.",
  );
  await expect(page.getByText("Profile completion")).toBeVisible();
  await nav.getByRole("button", { name: "Preview" }).click();
  const preview = page.getByRole("article", { name: "Profile preview" });
  await expect(preview.getByText("University of Testing")).toBeVisible();
  await expect(preview.getByText("TypeScript")).toBeVisible();
  await expect(preview.getByText("Folioone", { exact: true })).toBeVisible();
  await expect(preview.getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/journey-tester",
  );

  // 6. Forgot-password flow shows a neutral confirmation (no account enumeration).
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account exists/)).toBeVisible();
});
