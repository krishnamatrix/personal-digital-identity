import { expect, test, type Response } from "@playwright/test";

const testEmail = process.env.FOLIOONE_DEV_TEST_EMAIL;
const testPassword = process.env.FOLIOONE_DEV_TEST_PASSWORD;
const skipOtherDevelopmentAccountFlow =
  process.env.FOLIOONE_SKIP_AUTHENTICATED_E2E === "1";

test("unauthenticated visitor cannot see the private profile", async ({
  page,
}) => {
  await page.goto("/profile");

  await expect(
    page.getByRole("heading", { name: "Your profile" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Sign in with your Folioone account to manage your private identity profile.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login",
  );
  await expect(page.getByLabel("Professional headline")).toHaveCount(0);
});

test("development user initializes, updates, reloads, and signs out", async ({
  page,
}) => {
  test.skip(
    skipOtherDevelopmentAccountFlow || !testEmail || !testPassword,
    skipOtherDevelopmentAccountFlow
      ? "Skipped to keep this run scoped to the two designated RLS test accounts."
      : "Set dedicated development test-user credentials to enable hosted authenticated checks.",
  );

  await page.goto("/login");
  await page.getByLabel("Email").fill(testEmail!);
  await page.getByLabel("Password").fill(testPassword!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel("Professional headline")).toBeVisible();

  const headline = page.getByLabel("Professional headline");
  const previousHeadline = await headline.inputValue();
  const validationHeadline = `Folioone validation ${Date.now()}`;
  let logoutActionResponse: Response | undefined;
  page.on("response", (response) => {
    const request = response.request();
    if (
      request.method() === "POST" &&
      new URL(response.url()).pathname === "/profile"
    ) {
      logoutActionResponse = response;
    }
  });

  try {
    await headline.fill(validationHeadline);
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Your private profile has been saved.",
    );

    await page.reload();
    await expect(page.getByLabel("Professional headline")).toHaveValue(
      validationHeadline,
    );

    await headline.fill(previousHeadline);
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Your private profile has been saved.",
    );
    await page.reload();
    await expect(headline).toHaveValue(previousHeadline);

    logoutActionResponse = undefined;
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect.poll(() => logoutActionResponse !== undefined).toBe(true);
    const actionHeaders = await logoutActionResponse!.headers();
    expect(
      actionHeaders["x-action-redirect"] ?? "",
      "logout action should redirect after clearing the session",
    ).toContain("/login");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/profile");
    await expect(
      page.getByText(
        "Sign in with your Folioone account to manage your private identity profile.",
      ),
    ).toBeVisible();
  } finally {
    if (page.url().endsWith("/profile") && (await headline.count())) {
      await headline.fill(previousHeadline);
      await page.getByRole("button", { name: "Save profile" }).click();
      await expect(page.getByRole("status")).toHaveText(
        "Your private profile has been saved.",
      );
    }
  }
});
