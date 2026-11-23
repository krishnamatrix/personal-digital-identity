import { expect, test, type Page } from "@playwright/test";
import { setLocalPro } from "../tests/helpers/local-psql";

/**
 * ChatCards against the LOCAL stack: a PRO owner creates a verified-access card with activation
 * codes and publishes it; a reader on a phone opens the link, creates a FREE account, redeems a
 * code and requests a conversation; the owner accepts and replies; the reader cannot create
 * ChatCards (upgrade screen); pausing stops new conversations. Screenshots of each key screen
 * are saved under test-results/local/chatcards/.
 */
test.skip(
  process.env.FOLIOONE_VALIDATE !== "1" ||
    !process.env.FOLIOONE_LOCAL_DB_CONTAINER,
  "Local validation only: creates throwaway accounts and grants PRO locally.",
);

const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const ownerEmail = `cc-owner-${tag}@example.test`;
const readerEmail = `cc-reader-${tag}@example.test`;
const password = `Pw-${tag}-correct`;
const shot = (page: Page, name: string) =>
  page.screenshot({
    path: `test-results/local/chatcards/${name}.png`,
    fullPage: true,
  });

async function signUp(page: Page, name: string, email: string) {
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}

test("owner publishes a verified ChatCard; a free reader redeems a code and they talk", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const ownerCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const owner = await ownerCtx.newPage();

  // --- Owner: Free first (upgrade screen), then PRO -------------------------------------
  await owner.goto("/signup");
  await signUp(owner, "Jane Writer", ownerEmail);
  await expect(owner).toHaveURL(/\/onboarding$/);
  await owner.goto("/chatcards");
  await expect(owner.getByTestId("chatcards-upgrade")).toBeVisible();
  setLocalPro(ownerEmail, "30 days");
  await owner.goto("/chatcards");
  await expect(owner.getByTestId("chatcards-empty")).toBeVisible();
  await shot(owner, "01-dashboard-empty");

  // --- Wizard ---------------------------------------------------------------------------
  await owner.getByRole("link", { name: "New ChatCard" }).click();
  await owner.getByLabel("Title", { exact: true }).fill("Ask the Author");
  await owner.getByLabel("Name shown to people").fill("Jane Writer");
  await owner
    .getByLabel("Description")
    .fill("Questions about The Quiet Orchard, for readers of the book.");
  await owner
    .getByLabel("Welcome message")
    .fill("Thank you for reading. Tell me what you thought.");
  await shot(owner, "02-wizard-basics");
  await owner.getByRole("button", { name: "Next" }).click();
  await owner.getByRole("radio", { name: /Verified access/ }).check();
  await owner.getByLabel("Number of codes").fill("3");
  await shot(owner, "03-wizard-access");
  await owner.getByRole("button", { name: "Next" }).click();
  await shot(owner, "04-wizard-conversations");
  await owner.getByRole("button", { name: "Next" }).click();
  await expect(owner.getByTestId("chat-card-face")).toBeVisible();
  await shot(owner, "05-wizard-preview");
  await owner.getByRole("button", { name: "Publish ChatCard" }).click();
  await expect(
    owner.getByRole("heading", { name: "Your ChatCard is live" }),
  ).toBeVisible();
  await owner.getByText(/^Show codes/).click();
  const codes = (
    await owner.getByTestId("issued-code-list").locator("li").allInnerTexts()
  ).map((c) => c.trim());
  expect(codes).toHaveLength(3);
  for (const c of codes) expect(c).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
  const url = (await owner.getByTestId("chatcard-url").innerText()).trim();
  expect(url).toMatch(/\/chat\/[0-9a-f]{32}$/);
  await expect(owner.getByTestId("chatcard-qr")).toBeVisible();
  await shot(owner, "06-published-codes-and-qr");

  // --- Reader on a phone: anonymous landing page ---------------------------------------
  const readerCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const reader = await readerCtx.newPage();
  await reader.goto(`${new URL(url).pathname}?src=qr`);
  await expect(
    reader.getByRole("heading", { name: "Ask the Author" }),
  ).toBeVisible();
  await expect(reader.getByText("Activation code required")).toBeVisible();
  const html = await reader.content();
  expect(html).not.toContain(ownerEmail);
  expect(html).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
  );
  const scroll = await reader.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(scroll).toBeLessThanOrEqual(0);
  await shot(reader, "07-landing-mobile-anonymous");

  // --- Reader: free account, code, request ---------------------------------------------
  await reader.getByRole("link", { name: "Create a free account" }).click();
  await signUp(reader, "Ada Reader", readerEmail);
  await expect(reader).toHaveURL(new RegExp(`${new URL(url).pathname}$`));
  await reader.getByLabel("Activation code").fill("AAAA-BBBB-CCCC-DDDD");
  await reader.getByRole("button", { name: "Redeem code" }).click();
  await expect(reader.locator("#code-error")).toContainText(
    "That code did not work",
  );
  await shot(reader, "08-redeem-rejected");
  await reader.getByLabel("Activation code").fill(codes[0]!.toLowerCase());
  await reader.getByRole("button", { name: "Redeem code" }).click();
  await expect(reader.getByText(/Code accepted/)).toBeVisible();
  await reader
    .getByLabel(/Your name, as Jane Writer will see it/)
    .fill("Ada Reader");
  await reader
    .getByLabel("Message", { exact: true })
    .fill("I loved chapter three. Is the orchard real?");
  await shot(reader, "09-request-form-mobile");
  await reader.getByRole("button", { name: "Send request" }).click();
  await expect(reader).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  await expect(reader.getByTestId("request-waiting")).toBeVisible();
  const conversationUrl = reader.url();
  await shot(reader, "10-request-waiting-mobile");

  // The free reader cannot create ChatCards.
  await reader.goto("/chatcards");
  await expect(reader.getByTestId("chatcards-upgrade")).toBeVisible();
  await shot(reader, "11-upgrade-free-account");

  // --- Owner: inbox, accept, reply ------------------------------------------------------
  await owner.goto("/messages");
  await expect(owner.getByTestId("inbox-row").first()).toContainText(
    "Ada Reader",
  );
  await shot(owner, "12-inbox-new-request");
  await owner.getByTestId("inbox-row").first().click();
  await expect(owner.getByTestId("conversation-origin")).toContainText(
    "Redeemed an activation code",
  );
  await owner
    .getByTestId("request-actions")
    .getByRole("button", { name: "Accept" })
    .click();
  await expect(owner.getByLabel("Message", { exact: true })).toBeVisible();
  await owner
    .getByLabel("Message", { exact: true })
    .fill("It is! Thank you for reading.");
  await owner.getByRole("button", { name: "Send" }).click();
  await expect(owner.getByTestId("message-list")).toContainText(
    "It is! Thank you for reading.",
  );
  await shot(owner, "13-conversation-owner");

  // --- Reader sees the reply and answers -----------------------------------------------
  await reader.goto(conversationUrl);
  await expect(reader.getByTestId("message-list")).toContainText(
    "It is! Thank you for reading.",
  );
  await reader
    .getByLabel("Message", { exact: true })
    .fill("Wonderful, thank you!");
  await reader.getByRole("button", { name: "Send" }).click();
  await expect(reader.getByTestId("message-list")).toContainText(
    "Wonderful, thank you!",
  );
  await shot(reader, "14-conversation-reader-mobile");

  // --- The same code cannot be used twice; another reader would be refused --------------
  // (covered at the database level in tests/hosted/chatcards.hosted.ts)

  // --- Owner pauses: the landing page says so; the existing conversation continues ------
  await owner.goto("/chatcards");
  await expect(owner.getByTestId("chat-card-row")).toHaveCount(1);
  await shot(owner, "15-dashboard-with-card");
  await owner.getByRole("button", { name: "Pause" }).click();
  await expect(owner.getByTestId("chat-card-status")).toHaveText("Paused");
  const anon = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  await anon.goto(new URL(url).pathname);
  await expect(anon.getByText("Paused for now")).toBeVisible();
  await shot(anon, "16-landing-paused");

  // --- Codes tab: one used, two unused -------------------------------------------------
  await owner.getByRole("link", { name: "Ask the Author" }).click();
  await owner.getByRole("tab", { name: "Activation codes" }).click();
  await expect(owner.getByTestId("code-batch-counts")).toContainText("Used: 1");
  await expect(owner.getByTestId("code-batch-counts")).toContainText(
    "Unused: 2",
  );
  await shot(owner, "17-codes-management");

  await ownerCtx.close();
  await readerCtx.close();
});
