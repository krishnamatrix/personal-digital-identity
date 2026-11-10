import { expect, test, type Page } from "@playwright/test";

/**
 * M6 articles journey against the LOCAL stack: write and format, autosave and reload, preview,
 * lifecycle, listing filters/search/sort, concurrent-edit conflict, explicit website inclusion,
 * public listing + detail page + SEO, immediate revocation, responsive layouts. Creates one
 * throwaway local account. Not part of the staging smoke suite.
 */
test.skip(
  process.env.FOLIOONE_VALIDATE !== "1",
  "Local validation only: creates a throwaway account.",
);

const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const email = `art-${tag}@example.test`;
const password = `Pw-${tag}-correct`;
const siteSlug = `writer-${tag}`;
const name = `Writer ${tag}`;
const TITLE = `Designing calm software ${tag}`;
const SHOTS = ".validate/articles-screenshots";

const body = (page: Page) =>
  page.getByTestId("article-editor").locator(".ProseMirror");
const tool = (page: Page, label: string) =>
  page
    .getByRole("toolbar", { name: "Formatting" })
    .getByRole("button", { name: label, exact: true });
const saved = (page: Page) =>
  expect(page.getByTestId("save-state")).toContainText("Saved", {
    timeout: 15_000,
  });

async function newArticle(page: Page) {
  await page.goto("/articles");
  await page.getByRole("button", { name: "New Article" }).first().click();
  await expect(page).toHaveURL(/\/articles\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("article-status")).toHaveText("Draft");
  return page.url();
}

test("write, format, publish, feature on the website, and revoke articles", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000);

  // --- account + identity ------------------------------------------------------------------
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto("/profile");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Professional headline").fill("Writer and designer");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "saved" }),
  ).toBeVisible();

  // --- navigation + empty state ------------------------------------------------------------
  await page.getByRole("link", { name: "Articles & Thoughts" }).first().click();
  await expect(page).toHaveURL(/\/articles$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Articles & Thoughts" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Write your first article" }),
  ).toBeVisible();

  // --- editor: write with every supported format -------------------------------------------
  const editorUrl = await newArticle(page);
  await page.getByLabel("Title", { exact: true }).fill(TITLE);
  await page.getByLabel("Subtitle").fill("Notes on restraint");
  await body(page).click();
  await tool(page, "Heading").click();
  await page.keyboard.type("A clear heading");
  await page.keyboard.press("Enter");
  await tool(page, "Bold").click();
  await page.keyboard.type("Bold words");
  await tool(page, "Bold").click();
  await tool(page, "Italic").click();
  await page.keyboard.type(" then italic");
  await tool(page, "Italic").click();
  await page.keyboard.type(" and plain text.");
  await page.keyboard.press("Enter");
  await tool(page, "Bulleted list").click();
  await page.keyboard.type("First point");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second point");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await tool(page, "Numbered list").click();
  await page.keyboard.type("Step one");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await tool(page, "Quote").click();
  await page.keyboard.type("Simplicity is the ultimate sophistication.");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(body(page)).toContainText(
    "Simplicity is the ultimate sophistication.",
  );
  await expect(body(page)).toContainText("Second point");
  await tool(page, "Code block").click();
  await page.keyboard.type("const answer = 42;");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(body(page)).toContainText("const answer = 42;");
  await tool(page, "Divider").click();
  await page.keyboard.type("A link to follow");
  for (let i = 0; i < "A link to follow".length; i++)
    await page.keyboard.press("Shift+ArrowLeft");
  await tool(page, "Link").click();
  await page.getByLabel("Link address").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Apply link" }).click();
  await expect(page.getByText("Enter a full web address")).toBeVisible();
  await page.getByLabel("Link address").fill("https://example.com/read");
  await page.getByRole("button", { name: "Apply link" }).click();
  await expect(body(page).locator("a")).toHaveText("A link to follow");
  await expect(body(page)).toBeFocused();
  await page.waitForTimeout(400); // Tiptap restores editor focus on the next frame
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(body(page), "text before image").toContainText(
    "A clear heading",
  );
  await expect(body(page).locator("a")).toHaveText("A link to follow");
  await tool(page, "Image from URL").click();
  await page.getByLabel("Image address").fill("https://example.com/pic.png");
  await page.getByRole("button", { name: "Insert image" }).click();
  await page.getByLabel("Excerpt").fill("A short summary for cards.");
  await page
    .getByLabel("Cover image URL")
    .fill("https://example.com/cover.png");
  await page.getByLabel("Category").fill("Design");
  await page.getByLabel("Tags").fill("craft, calm, craft");
  await page.getByText("Search & sharing").click();
  await page.getByLabel("SEO title").fill(`SEO ${TITLE}`);
  await page.getByLabel("SEO description").fill("Custom search description.");

  // Unsaved work is guarded, then autosave catches up.
  expect(
    await page.evaluate(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    }),
  ).toBe(true);
  await saved(page);
  await expect(page.getByTestId("word-count")).not.toHaveText("0");
  await expect(page.getByTestId("reading-time")).toHaveText("1 min");
  expect(
    await page.evaluate(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    }),
    "no warning once saved",
  ).toBe(false);

  // Formatting survives a reload.
  await page.reload();
  const ed = body(page);
  await expect(ed.locator("h2")).toHaveText("A clear heading");
  await expect(ed.locator("strong")).toHaveText("Bold words");
  await expect(ed.locator("em")).toContainText("then italic");
  await expect(ed.locator("ul li")).toHaveCount(2);
  await expect(ed.locator("ol li")).toHaveCount(1);
  await expect(ed.locator("blockquote")).toContainText("Simplicity");
  await expect(ed.locator("pre code")).toHaveText("const answer = 42;");
  await expect(ed.locator("hr")).toHaveCount(1);
  await expect(ed.locator("a[href='https://example.com/read']")).toHaveText(
    "A link to follow",
  );
  await expect(
    ed.locator("img[src='https://example.com/pic.png']"),
  ).toHaveCount(1);
  await expect(page.getByLabel("Category")).toHaveValue("Design");
  await expect(page.getByLabel("Tags")).toHaveValue("craft, calm");
  await page.screenshot({
    path: `${SHOTS}/editor-desktop.png`,
    fullPage: true,
  });

  // Preview matches the public rendering (same renderer).
  await page.getByRole("button", { name: "Preview" }).click();
  const preview = page.getByTestId("article-preview");
  await expect(
    preview.getByRole("heading", { level: 1, name: TITLE }),
  ).toBeVisible();
  await expect(preview.locator("h2")).toHaveText("A clear heading");
  await expect(preview.locator("pre code")).toHaveText("const answer = 42;");
  await page.screenshot({
    path: `${SHOTS}/preview-desktop.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Write" }).click();

  // --- two more articles for list behaviour -------------------------------------------------
  await newArticle(page);
  await page.getByLabel("Title", { exact: true }).fill(`Alpha draft ${tag}`);
  await body(page).click();
  await page.keyboard.type("Quokka research notes.");
  await saved(page);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("article-status")).toHaveText("Published");
  await newArticle(page);
  await page.getByLabel("Title", { exact: true }).fill(`Zulu draft ${tag}`);
  await body(page).click();
  await page.keyboard.type("Nothing special here.");
  await saved(page);

  // An empty article cannot be published.
  await newArticle(page);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByText("Add a title and some content before publishing.").last(),
  ).toBeVisible();
  await expect(page.getByTestId("article-status")).toHaveText("Draft");
  const emptyUrl = page.url();

  await page.goto("/articles");
  const list = page.getByTestId("article-list");
  await expect(list.getByRole("link")).toHaveCount(4);
  await page.getByRole("link", { name: /^Published/ }).click();
  await expect(list.getByRole("link")).toHaveCount(1);
  await expect(list).toContainText(`Alpha draft ${tag}`);
  await page.getByRole("link", { name: /^Drafts/ }).click();
  await expect(list.getByRole("link")).toHaveCount(3);
  await page.getByRole("link", { name: /^All/ }).click();
  await expect(list.getByRole("link")).toHaveCount(4);
  await page.getByLabel("Search articles").fill("quokka");
  await page.getByLabel("Search articles").press("Enter");
  await expect(list.getByRole("link")).toHaveCount(1);
  await expect(list).toContainText(`Alpha draft ${tag}`);
  await page.getByLabel("Search articles").fill("no-such-text-anywhere");
  await page.getByLabel("Search articles").press("Enter");
  await expect(
    page.getByRole("heading", { name: "No matching articles" }),
  ).toBeVisible();
  await page.goto("/articles?sort=title");
  await expect(list.getByRole("link").nth(1)).toContainText("Alpha draft");
  await expect(list.getByRole("link").last()).toContainText("Zulu draft");
  await page.screenshot({ path: `${SHOTS}/list-desktop.png`, fullPage: true });
  // Empty-article cleanup (also exercises delete confirmation).
  await page.goto(emptyUrl);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("cannot be undone");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page).toHaveURL(emptyUrl);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete article" })
    .click();
  await expect(page).toHaveURL(/\/articles$/);
  await expect(list.getByRole("link")).toHaveCount(3);

  // --- concurrent edits: the stale session is refused ---------------------------------------
  const other = await page.context().newPage();
  await page.goto(editorUrl);
  await other.goto(editorUrl);
  await page.getByLabel("Subtitle").fill("Edited in session one");
  await saved(page);
  await other.getByLabel("Subtitle").fill("Edited in session two");
  await expect(other.getByTestId("save-state")).toHaveText(
    "Changed elsewhere",
    { timeout: 15_000 },
  );
  await expect(
    other
      .getByRole("alert")
      .filter({ hasText: "changed in another session" })
      .last(),
  ).toContainText("changed in another session");
  await other.close();
  await page.reload();
  await expect(page.getByLabel("Subtitle")).toHaveValue(
    "Edited in session one",
  );

  // --- publish the main article: Folioone-published is NOT website-published ----------------
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("article-status")).toHaveText("Published");
  await expect(page.getByText("only once you select it").last()).toBeVisible();

  // --- website: select explicitly -----------------------------------------------------------
  await page.goto("/website");
  await page.getByRole("button", { name: "Choose your address" }).click();
  await page.getByLabel("Your address").fill(siteSlug);
  await expect(page.locator("#slug-status")).toContainText("Looks available");
  await page.getByRole("button", { name: "Claim this address" }).click();
  await expect(page.getByTestId("website-status")).toHaveText("Draft");
  const tab = (n: string) =>
    page
      .getByRole("navigation", { name: "Website sections" })
      .getByRole("button", { name: new RegExp(`^${n}`) });
  await tab("Content").click();
  await page
    .getByRole("button", { name: "Expand Articles & thoughts" })
    .click();
  await expect(page.getByLabel(`Include Zulu draft ${tag}`)).toHaveCount(0); // drafts are never offered
  await expect(page.getByLabel(`Include Alpha draft ${tag}`)).toBeVisible();
  await page.getByLabel(`Include ${TITLE}`).check();
  await page.getByLabel(`Include Alpha draft ${tag}`).check();
  await page
    .getByRole("button", { name: `Move article ${TITLE} down` })
    .click();
  await page.getByRole("switch", { name: "Show Articles & thoughts" }).check();
  await tab("Publish").click();
  await page
    .getByRole("button", { name: "Publish", exact: true })
    .last()
    .click();
  await expect(page.getByTestId("website-status")).toHaveText("Published");

  // --- public site as a signed-out visitor ---------------------------------------------------
  const anonContext = await browser.newContext({ baseURL });
  const anon = await anonContext.newPage();
  const home = await anon.goto(`/${siteSlug}`);
  expect(home!.status()).toBe(200);
  const section = anon.locator("#articles");
  await expect(section).toBeVisible();
  const links = section.getByRole("link");
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveText(`Alpha draft ${tag}`); // owner's order
  await expect(section).not.toContainText("Zulu");

  const mainSlug = (await section
    .getByRole("link", { name: TITLE })
    .getAttribute("href"))!;
  expect(mainSlug).toMatch(
    new RegExp(`^/${siteSlug}/articles/designing-calm-software-`),
  );
  const res = await anon.goto(mainSlug);
  expect(res!.status()).toBe(200);
  await expect(
    anon.getByRole("heading", { level: 1, name: TITLE }),
  ).toBeVisible();
  await expect(anon.locator("article h2")).toHaveText("A clear heading");
  await expect(anon.locator("article strong")).toHaveText("Bold words");
  await expect(anon.locator("article pre code")).toHaveText(
    "const answer = 42;",
  );
  await expect(anon.locator("article blockquote")).toContainText("Simplicity");
  await expect(anon.locator("article a[rel~=nofollow]")).toHaveAttribute(
    "href",
    "https://example.com/read",
  );
  await expect(anon).toHaveTitle(new RegExp(`SEO ${TITLE}.*${name}`));
  const meta = (sel: string, attr = "content") =>
    anon.locator(sel).getAttribute(attr);
  expect(await meta('meta[name="description"]')).toBe(
    "Custom search description.",
  );
  expect(await meta('meta[property="og:type"]')).toBe("article");
  expect(await meta('meta[property="og:title"]')).toBe(`SEO ${TITLE}`);
  expect(await meta('meta[property="og:image"]')).toBe(
    "https://example.com/cover.png",
  );
  expect(await meta('link[rel="canonical"]', "href")).toContain(`${mainSlug}`);
  expect(await meta('meta[property="article:published_time"]')).toBeTruthy();
  const html = await anon.content();
  expect(html).not.toContain("javascript:");
  expect(html).not.toMatch(/Folioone internal|Workspace navigation/);
  await anon.screenshot({
    path: `${SHOTS}/public-article-desktop.png`,
    fullPage: true,
  });

  // Not a published/selected article, an unknown one, and a foreign slug all 404.
  expect(
    (await anon.goto(`/${siteSlug}/articles/zulu-draft-${tag}`))!.status(),
  ).toBe(404);
  expect((await anon.goto(`/${siteSlug}/articles/nope`))!.status()).toBe(404);
  expect((await anon.goto(`/someone-else/articles/nope`))!.status()).toBe(404);

  // --- revocation is immediate ---------------------------------------------------------------
  await page.goto(editorUrl);
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByTestId("article-status")).toHaveText("Draft");
  expect((await anon.goto(mainSlug))!.status(), "unpublished article").toBe(
    404,
  );
  await anon.goto(`/${siteSlug}`);
  await expect(anon.locator("#articles").getByRole("link")).toHaveCount(1);

  // Republishing the article alone does not bring it back; republishing the website does.
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("article-status")).toHaveText("Published");
  expect((await anon.goto(mainSlug))!.status()).toBe(404);
  await page.goto("/website");
  await page.getByRole("button", { name: "Republish" }).click();
  await expect(page.getByText("Your website is live.")).toBeVisible();
  expect((await anon.goto(mainSlug))!.status()).toBe(200);

  // Archive (with confirmation) removes it at once; restore returns it to drafts only.
  await page.goto(editorUrl);
  await page.getByRole("button", { name: "Archive" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive" })
    .click();
  await expect(page.getByTestId("article-status")).toHaveText("Archived");
  expect((await anon.goto(mainSlug))!.status(), "archived article").toBe(404);
  await expect(page.getByLabel("Title", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Restore to draft" }).click();
  await expect(page.getByTestId("article-status")).toHaveText("Draft");
  await expect(page.getByLabel("Title", { exact: true })).toBeEnabled();

  // Removed from the website configuration: gone after republish.
  await page.goto("/website");
  await tab("Content").click();
  await page
    .getByRole("button", { name: "Expand Articles & thoughts" })
    .click();
  await page.getByLabel(`Include Alpha draft ${tag}`).uncheck();
  await tab("Design").click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await tab("Publish").click();
  await page.getByRole("button", { name: "Republish" }).last().click();
  await expect(page.getByText("Your website is live.")).toBeVisible();
  await anon.goto(`/${siteSlug}`);
  await expect(anon.locator("#articles")).toHaveCount(0);
  expect(
    (await anon.goto(`/${siteSlug}/articles/alpha-draft-${tag}`))!.status(),
  ).toBe(404);

  // Unpublishing the website withdraws everything.
  await page.getByRole("button", { name: "Unpublish" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Unpublish" })
    .click();
  await expect(page.getByTestId("website-status")).toHaveText("Unpublished");
  expect((await anon.goto(`/${siteSlug}`))!.status()).toBe(404);
  await anonContext.close();
});

test("the editor and list are usable on tablet and mobile", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const tagB = `${tag}m`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Mobile Writer");
  await page.getByLabel("Email").fill(`m-${tagB}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await newArticle(page);
  await page
    .getByLabel("Title", { exact: true })
    .fill(
      "A very long title that must wrap across lines on narrow screens without causing overflow",
    );
  await body(page).click();
  await page.keyboard.type("Responsive body text.");
  await saved(page);
  for (const [label, width, height] of [
    ["tablet", 820, 1180],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
    await expect(tool(page, "Bold")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, `${label}: no horizontal scroll`).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: `${SHOTS}/editor-${label}.png`,
      fullPage: true,
    });
    await page.goto("/articles");
    const listOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(
      listOverflow,
      `${label}: list has no horizontal scroll`,
    ).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: `${SHOTS}/list-${label}.png`,
      fullPage: true,
    });
    await page.getByTestId("article-list").getByRole("link").first().click();
  }
});
