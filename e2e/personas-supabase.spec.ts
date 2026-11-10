import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { folioneDbOptions, type FolioneClient } from "../src/lib/db/schema";

// Persona acceptance against the REAL database (M3D). Run only through
// playwright.supabase.config.ts (PERSONA_STORAGE=supabase). The workflow itself is
// driven through the real UI by personas.spec.ts; this file adds what the UI
// cannot show: the actual database rows, two-user isolation and cleanup.

const url = process.env.E2E_SUPABASE_URL;
const anon = process.env.E2E_SUPABASE_ANON_KEY;
const aEmail = process.env.FOLIOONE_DEV_TEST_EMAIL;
const aPassword = process.env.FOLIOONE_DEV_TEST_PASSWORD;
const bEmail = process.env.E2E_USER_B_EMAIL;
const bPassword = process.env.E2E_USER_B_PASSWORD;
const enabled =
  process.env.E2E_PERSONA_STORAGE === "supabase" &&
  Boolean(url && anon && aEmail && aPassword && bEmail && bPassword);
const run = Date.now().toString(36);

async function api(email: string, password: string): Promise<FolioneClient> {
  const client = createClient(url!, anon!, {
    db: folioneDbOptions,
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error("Test user sign-in failed");
  return client;
}

async function uiSignIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/profile$/);
}

/** Removes every Persona these suites created ("E2E ..."), through the approved RPCs only. */
async function purge(client: FolioneClient) {
  const { data } = await client
    .from("personas")
    .select("id,version,status,name")
    .like("name", "E2E %");
  for (const row of data ?? []) {
    let version = row.version as number;
    if (row.status !== "archived") {
      const r = await client.rpc("persona_set_lifecycle", {
        p_persona_id: row.id,
        p_expected_version: version,
        p_status: "archived",
      });
      version = (r.data as { version: number }).version;
    }
    await client.rpc("persona_delete", {
      p_persona_id: row.id,
      p_expected_version: version,
    });
  }
}

test.describe("Persona persistence against Supabase", () => {
  test.skip(!enabled, "Run through playwright.supabase.config.ts");
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  test("UI creation writes the expected rows; B cannot reach them; A's data survives a reload", async ({
    browser,
  }) => {
    const name = `E2E db ${run}`;
    const a = await api(aEmail!, aPassword!);
    const b = await api(bEmail!, bPassword!);
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    try {
      await uiSignIn(pageA, aEmail!, aPassword!);
      await pageA.goto("/personas/new");
      await pageA.getByLabel("Name", { exact: true }).fill(name);
      for (let i = 0; i < 3; i++)
        await pageA.getByRole("button", { name: "Next", exact: true }).click();
      await pageA.getByRole("button", { name: "Create Persona" }).click();
      await expect(
        pageA.getByRole("heading", { name, level: 1 }),
      ).toBeVisible();
      const personaUrl = pageA.url();
      const id = personaUrl.split("/personas/")[1].split(/[?#]/)[0];

      // The actual database state, read with A's own session.
      const row = await a.from("personas").select("*").eq("id", id).single();
      expect(row.data).toMatchObject({ name, status: "active", version: 1 });
      const count = async (table: string) =>
        (
          await a
            .from(table)
            .select("persona_id", { count: "exact", head: true })
            .eq("persona_id", id)
        ).count;
      expect(await count("persona_profile_field_selections")).toBe(7);
      expect(await count("persona_sections")).toBe(9);
      expect(await count("persona_revisions")).toBe(1);

      // Persistence across a reload.
      await pageA.reload();
      await expect(
        pageA.getByRole("heading", { name, level: 1 }),
      ).toBeVisible();

      // Ownership isolation, in the database and in the UI.
      expect((await b.from("personas").select("id").eq("id", id)).data).toEqual(
        [],
      );
      const ctxB = await browser.newContext();
      const pageB = await ctxB.newPage();
      try {
        await uiSignIn(pageB, bEmail!, bPassword!);
        await pageB.goto(personaUrl);
        await expect(
          pageB.getByRole("heading", { name, level: 1 }),
        ).toHaveCount(0);
        await expect(pageB).toHaveTitle(/Persona not found/);
        await pageB.goto("/personas?show=all");
        await expect(pageB.getByRole("article", { name })).toHaveCount(0);
      } finally {
        await ctxB.close();
      }

      // A stale write from the browser is refused and the newer data wins (database view).
      const other = await ctxA.newPage();
      await other.goto(personaUrl);
      await other.getByRole("tab", { name: "Details" }).click();
      await other.getByLabel("Description (optional)").fill(`Newer ${run}`);
      await other.getByRole("button", { name: "Save details" }).click();
      await expect(other.getByText(/Version 2/)).toBeVisible();
      await pageA.getByRole("tab", { name: "Details" }).click();
      await pageA.getByLabel("Description (optional)").fill("Stale overwrite");
      await pageA.getByRole("button", { name: "Save details" }).click();
      await expect(pageA.getByText("Out of date")).toBeVisible();
      const after = await a
        .from("personas")
        .select("description,version")
        .eq("id", id)
        .single();
      expect(after.data).toEqual({ description: `Newer ${run}`, version: 2 });
      await other.close();
    } finally {
      await ctxA.close();
      await purge(a);
      const left = await a.from("personas").select("id").like("name", "E2E %");
      expect(left.data).toEqual([]);
    }
  });

  test("signed-out visitors are sent to sign in and see no Persona data", async ({
    page,
  }) => {
    await page.goto("/personas");
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.getByText(/Sign in|signed out/i).first()).toBeVisible();
  });

  test("cleanup: no E2E Personas remain for A or B", async () => {
    for (const [e, p] of [
      [aEmail!, aPassword!],
      [bEmail!, bPassword!],
    ]) {
      const c = await api(e, p);
      await purge(c);
      expect(
        (await c.from("personas").select("id").like("name", "E2E %")).data,
      ).toEqual([]);
    }
  });
});
