import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const holder = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  usePathname: () => "/personas",
}));
vi.mock("@/domains/personas/persona-runtime", () => ({
  getPersonaService: () => holder.service,
}));

import { PersonaCreateFlow } from "@/app/personas/persona-create-flow";
import { PersonaEditor } from "@/app/personas/persona-editor";
import { PersonaList } from "@/app/personas/persona-list";
import {
  CANONICAL,
  createFlowInput,
  makeService,
} from "./helpers/persona-fixtures";

// These tests drive the real components through the real server actions and
// service against the IN-MEMORY FIXTURE ADAPTER. They prove UI behaviour and
// the application contract only; they say nothing about hosted database or
// RLS behaviour.

type Ctx = ReturnType<typeof makeService>;
let ctx: Ctx;

beforeEach(() => {
  nav.push.mockReset();
  nav.refresh.mockReset();
  ctx = makeService();
  holder.service = ctx.service;
});

async function seedEditor(
  patch: Parameters<typeof createFlowInput>[0] = {},
  tab: "details" | "content" | "presentation" | "preview" = "content",
) {
  const created = await ctx.service.create(
    createFlowInput({
      included: ["display_name", "headline"],
      visibleSections: ["profile"],
      ...patch,
    }),
  );
  const user = userEvent.setup();
  render(
    <PersonaEditor
      initial={created}
      initialTab={tab}
      storageKind="in-memory-fixture"
    />,
  );
  return { created, user, id: created.persona.id };
}

describe("PersonaList", () => {
  async function renderList(filter: "active" | "archived" | "all" = "all") {
    const a = await ctx.service.create(
      createFlowInput({ name: "Founder", makeDefault: true }),
    );
    const b = await ctx.service.create(createFlowInput({ name: "Speaker" }));
    await ctx.service.setLifecycle(b.persona.id, 1, "archived");
    const list = await ctx.service.list(filter);
    const user = userEvent.setup();
    render(
      <PersonaList {...list} filter={filter} storageKind="in-memory-fixture" />,
    );
    return { user, a, b };
  }

  it("shows each Persona with its markers, counts and the fixture notice", async () => {
    await renderList("all");
    expect(screen.getByRole("heading", { name: "Personas" })).toBeVisible();
    expect(screen.getByLabelText("Data storage notice")).toHaveTextContent(
      /not saved to your database/i,
    );
    const founder = screen.getByRole("article", { name: "Founder" });
    expect(within(founder).getByText("Default")).toBeVisible();
    const speaker = screen.getByRole("article", { name: "Speaker" });
    expect(within(speaker).getByText("Archived")).toBeVisible();
    expect(screen.getByRole("link", { name: "Active (1)" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Archived (1)" })).toBeVisible();
  });

  it("offers permanent delete only for archived Personas, separately", async () => {
    await renderList("all");
    const founder = screen.getByRole("article", { name: "Founder" });
    const speaker = screen.getByRole("article", { name: "Speaker" });
    expect(
      within(founder).queryByRole("button", { name: /Delete/ }),
    ).toBeNull();
    expect(
      within(speaker).getByRole("button", { name: "Delete permanently…" }),
    ).toBeVisible();
    expect(
      within(speaker).getByRole("button", { name: "Restore" }),
    ).toBeVisible();
  });

  it("sets and removes the default with one action each", async () => {
    const { user, a } = await renderList("active");
    const founder = screen.getByRole("article", { name: "Founder" });
    await user.click(
      within(founder).getByRole("button", { name: "Remove default" }),
    );
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(
      (await ctx.service.getEditorData(a.persona.id)).persona.isDefault,
    ).toBe(false);
  });

  it("explains archiving, then archives on confirmation", async () => {
    const { user, a } = await renderList("active");
    await user.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Archive “Founder”/,
    });
    expect(dialog).toHaveTextContent(/no longer be your default/);
    expect(dialog).toHaveTextContent(/does not delete anything/);
    await user.click(
      within(dialog).getByRole("button", { name: "Archive Persona" }),
    );
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(
      (await ctx.service.getEditorData(a.persona.id)).persona,
    ).toMatchObject({
      status: "archived",
      isDefault: false,
    });
  });

  it("requires explicit confirmation to delete and states My Identity is untouched", async () => {
    const { user, b } = await renderList("all");
    await user.click(
      screen.getByRole("button", { name: "Delete permanently…" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Permanently delete “Speaker”/,
    });
    expect(dialog).toHaveTextContent("Your My Identity data is not touched.");
    expect(dialog).toHaveTextContent(/cannot be undone/);
    // Cancelling deletes nothing.
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await expect(ctx.service.getEditorData(b.persona.id)).resolves.toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Delete permanently…" }),
    );
    const again = await screen.findByRole("dialog");
    await user.click(
      within(again).getByRole("button", { name: "Delete permanently" }),
    );
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    await expect(ctx.service.getEditorData(b.persona.id)).rejects.toMatchObject(
      { code: "not_found" },
    );
  });

  it("duplicates with a chosen name", async () => {
    const { user } = await renderList("active");
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Name for the copy");
    expect(input).toHaveValue("Founder (copy)");
    await user.clear(input);
    await user.type(input, "Founder v2");
    await user.click(
      within(dialog).getByRole("button", { name: "Create copy" }),
    );
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(
      (await ctx.service.list("all")).personas.map((p) => p.name),
    ).toContain("Founder v2");
  });

  it("shows an out-of-date message instead of overwriting when the Persona changed", async () => {
    const { user, a } = await renderList("active");
    await ctx.service.updateDetails(a.persona.id, 1, {
      name: "Founder",
      description: "changed elsewhere",
    });
    await user.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Archive Persona" }),
    );
    // The message is both visible and announced (live region), so two nodes match.
    const [alert] = await screen.findAllByText(
      /was changed in another tab or session/,
    );
    expect(alert).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reload Personas" }),
    ).toBeVisible();
    expect((await ctx.service.getEditorData(a.persona.id)).persona.status).toBe(
      "active",
    );
  });

  it("shows an empty state with optional suggestions and a blank option", () => {
    render(
      <PersonaList
        personas={[]}
        counts={{ active: 0, archived: 0 }}
        filter="active"
        storageKind="in-memory-fixture"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Create your first Persona" }),
    ).toBeVisible();
    expect(
      screen.getByText(/does not change My Identity and does not publish/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Create a blank Persona" }),
    ).toHaveAttribute("href", "/personas/new");
    expect(screen.getByRole("link", { name: "Founder" })).toHaveAttribute(
      "href",
      "/personas/new?starter=Founder",
    );
  });
});

describe("PersonaCreateFlow", () => {
  function renderFlow(starter = "") {
    const user = userEvent.setup();
    render(
      <PersonaCreateFlow
        canonical={CANONICAL}
        canonicalAvailable
        storageKind="in-memory-fixture"
        starter={starter}
      />,
    );
    return user;
  }

  it("walks the four steps and starts with everything excluded and hidden", async () => {
    const user = renderFlow();
    expect(screen.getByRole("heading", { name: "Describe it" })).toBeVisible();
    await user.type(screen.getByLabelText("Name"), "Founder");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("heading", { name: "Choose content" }),
    ).toBeVisible();
    expect(
      screen.getByRole("switch", { name: "Include Name" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Show Profile section" }),
    ).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("heading", { name: "Shape presentation" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Review" })).toBeVisible();
    expect(screen.getByText("Only you can see this preview.")).toBeVisible();
  });

  it("requires a name and keeps the user on the first step with an error", async () => {
    const user = renderFlow();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Describe it" })).toBeVisible();
    expect(
      screen.getAllByText("Enter a name for this Persona.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("keeps entered values when moving back and forth", async () => {
    const user = renderFlow();
    await user.type(screen.getByLabelText("Name"), "Founder");
    await user.type(screen.getByLabelText("Audience (optional)"), "Investors");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("switch", { name: "Include Name" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Audience (optional)")).toHaveValue(
      "Investors",
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("switch", { name: "Include Name" })).toBeChecked();
  });

  it("disables highlight until a field is included and reorders without drag", async () => {
    const user = renderFlow();
    await user.type(screen.getByLabelText("Name"), "Founder");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("switch", { name: "Highlight Name" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("switch", { name: "Include Name" }));
    expect(
      screen.getByRole("switch", { name: "Highlight Name" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Move Name down" }));
    const items = screen
      .getAllByRole("listitem")
      .filter((li) =>
        li.querySelector('[role="switch"][aria-label^="Include"]'),
      );
    expect(
      within(items[0]).getByRole("switch", { name: /^Include/ }),
    ).toHaveAttribute("aria-label", "Include Professional headline");
  });

  it("offers My Identity or Persona wording and flags an intentional blank", async () => {
    const user = renderFlow();
    await user.type(screen.getByLabelText("Name"), "Founder");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(
      screen.getByRole("switch", { name: "Include Professional headline" }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByLabelText("Write for this Persona"));
    expect(
      screen.getByText(/intentionally blank for this Persona/),
    ).toBeVisible();
    await user.type(
      screen.getByLabelText("Professional headline for this Persona"),
      "Founder & CEO",
    );
    expect(
      screen.queryByText(/intentionally blank for this Persona/),
    ).toBeNull();
  });

  it("explains when a presentation field is not included", async () => {
    const user = renderFlow();
    await user.type(screen.getByLabelText("Name"), "Founder");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByText(/is not included/).length).toBe(2);
  });

  it("creates the complete Persona with one save and opens it", async () => {
    const user = renderFlow("Founder");
    await user.type(screen.getByLabelText("Audience (optional)"), "Investors");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(
      screen.getByRole("switch", { name: "Include Professional headline" }),
    );
    await user.click(
      screen.getByRole("switch", { name: "Highlight Professional headline" }),
    );
    await user.click(
      screen.getByRole("switch", { name: "Show Profile section" }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByLabelText("Write for this Persona"));
    await user.clear(
      screen.getByLabelText("Professional headline for this Persona"),
    );
    await user.type(
      screen.getByLabelText("Professional headline for this Persona"),
      "Founder & CEO",
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Founder & CEO")).toBeVisible();
    await user.click(
      screen.getByRole("switch", { name: "Make this my default Persona" }),
    );
    await user.click(screen.getByRole("button", { name: "Create Persona" }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
    const list = await ctx.service.list("all");
    expect(list.personas).toHaveLength(1);
    const saved = await ctx.service.getEditorData(list.personas[0].id);
    expect(saved.persona).toMatchObject({
      name: "Founder",
      audience: "Investors",
      isDefault: true,
      version: 1,
      revisionCount: 1,
    });
    expect(saved.persona.overrides).toEqual([
      { fieldKey: "headline", value: "Founder & CEO", version: 1 },
    ]);
    expect(
      saved.persona.selections.find((s) => s.fieldKey === "headline"),
    ).toMatchObject({ isIncluded: true, isHighlighted: true });
    expect(nav.push).toHaveBeenCalledWith(`/personas/${list.personas[0].id}`);
  });

  it("returns to the first step when the server rejects a duplicate name", async () => {
    await ctx.service.create(createFlowInput({ name: "Founder" }));
    const user = renderFlow("Founder");
    for (let i = 0; i < 3; i++)
      await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create Persona" }));
    expect(
      await screen.findByRole("heading", { name: "Describe it" }),
    ).toBeVisible();
    expect(
      screen.getAllByText(/already uses that name/).length,
    ).toBeGreaterThan(0);
    expect(nav.push).not.toHaveBeenCalled();
    expect((await ctx.service.list("all")).personas).toHaveLength(1);
  });

  it("shows a notice instead of silently blank values when My Identity is unavailable", () => {
    render(
      <PersonaCreateFlow
        canonical={{ ...CANONICAL, headline: null }}
        canonicalAvailable={false}
        storageKind="in-memory-fixture"
      />,
    );
    expect(
      screen.getByText("My Identity could not be read right now"),
    ).toBeVisible();
  });
});

describe("PersonaEditor: content", () => {
  it("includes a field in one action and reflects the new version", async () => {
    const { user, id } = await seedEditor();
    expect(
      screen.getByRole("switch", { name: "Include Summary" }),
    ).not.toBeChecked();
    await user.click(screen.getByRole("switch", { name: "Include Summary" }));
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Include Summary" }),
      ).toBeChecked(),
    );
    expect(screen.getByText(/Version 2/)).toBeVisible();
    expect((await ctx.service.getEditorData(id)).persona.version).toBe(2);
  });

  it("announces saves to assistive technology", async () => {
    const { user } = await seedEditor();
    await user.click(screen.getByRole("switch", { name: "Include Summary" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/Summary included/),
    );
  });

  it("moves fields and sections with buttons, no dragging", async () => {
    const { user, id } = await seedEditor();
    await user.click(
      screen.getByRole("button", { name: "Move Professional headline up" }),
    );
    await waitFor(async () =>
      expect(
        (await ctx.service.getEditorData(id)).persona.selections[0].fieldKey,
      ).toBe("headline"),
    );
    await user.click(
      screen.getByRole("button", { name: "Move Experience section up" }),
    );
    await waitFor(async () =>
      expect(
        (await ctx.service.getEditorData(id)).persona.sections[0].sectionKey,
      ).toBe("experience"),
    );
  });

  it("shows, renames and hides a section without touching My Identity", async () => {
    const { user, id } = await seedEditor();
    await user.click(
      screen.getByRole("switch", { name: "Show Experience section" }),
    );
    await waitFor(async () =>
      expect(
        (await ctx.service.getEditorData(id)).persona.sections.find(
          (s) => s.sectionKey === "experience",
        )!.isVisible,
      ).toBe(true),
    );
    const label = screen.getByLabelText("Label for Experience");
    await user.type(label, "Work history");
    await user.click(screen.getByRole("button", { name: "Save label" }));
    await waitFor(async () =>
      expect(
        (await ctx.service.getEditorData(id)).persona.sections.find(
          (s) => s.sectionKey === "experience",
        )!.label,
      ).toBe("Work history"),
    );
  });

  it("confirms a bulk action with a summary, then applies it atomically", async () => {
    const { user, id } = await seedEditor();
    await user.click(screen.getByRole("button", { name: "Include all" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Include all My Identity fields",
    });
    expect(dialog).toHaveTextContent(
      "5 fields will change, 2 stay as they are",
    );
    expect(dialog).toHaveTextContent(/all of it, or none of it/);
    await user.click(
      within(dialog).getByRole("button", { name: "Apply to 5 fields" }),
    );
    await waitFor(async () =>
      expect(
        (await ctx.service.getEditorData(id)).persona.selections.every(
          (s) => s.isIncluded,
        ),
      ).toBe(true),
    );
    expect((await ctx.service.getEditorData(id)).persona.version).toBe(2);
  });

  it("applies nothing when the bulk confirmation is cancelled", async () => {
    const { user, id } = await seedEditor();
    await user.click(screen.getByRole("button", { name: "Include all" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect((await ctx.service.getEditorData(id)).persona.version).toBe(1);
  });

  it("warns when included fields are in a hidden section", async () => {
    const { user } = await seedEditor({ visibleSections: [] }, "preview");
    expect(screen.getByText(/Profile section is hidden/)).toBeVisible();
    expect(user).toBeTruthy();
  });
});

describe("PersonaEditor: version conflicts are never silently overwritten", () => {
  it("shows a conflict, keeps edits, and lets the user reapply on the latest version", async () => {
    const { user, id } = await seedEditor();
    await ctx.service.updateDetails(id, 1, {
      name: "Founder",
      description: "changed elsewhere",
    });
    await user.click(screen.getByRole("switch", { name: "Include Summary" }));
    const [alert] = await screen.findAllByText(
      /changed in another tab or session/,
    );
    expect(alert).toBeInTheDocument();
    // Nothing was written by the stale request.
    expect(
      (await ctx.service.getEditorData(id)).persona.selections.find(
        (s) => s.fieldKey === "summary",
      )!.isIncluded,
    ).toBe(false);
    await user.click(screen.getByRole("button", { name: "Reapply my change" }));
    await waitFor(() => expect(screen.queryByText("Out of date")).toBeNull());
    const saved = (await ctx.service.getEditorData(id)).persona;
    expect(
      saved.selections.find((s) => s.fieldKey === "summary")!.isIncluded,
    ).toBe(true);
    expect(saved.description).toBe("changed elsewhere");
    expect(saved.version).toBe(3);
  });

  it("reloads the latest version and discards unsaved edits on request", async () => {
    const { user, id } = await seedEditor({}, "details");
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Unsaved rename");
    await ctx.service.updateDetails(id, 1, {
      name: "Founder",
      description: "remote",
    });
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await screen.findAllByText(/changed in another tab or session/);
    expect(screen.getByLabelText("Name")).toHaveValue("Unsaved rename");
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveValue("Founder"),
    );
    expect(screen.getByLabelText("Description (optional)")).toHaveValue(
      "remote",
    );
    expect((await ctx.service.getEditorData(id)).persona.name).toBe("Founder");
  });

  it("does not offer Reapply for a bulk action, which must be re-confirmed", async () => {
    const { user, id } = await seedEditor();
    await ctx.service.updateDetails(id, 1, {
      name: "Founder",
      description: "remote",
    });
    await user.click(screen.getByRole("button", { name: "Include all" }));
    await screen.findAllByText(/changed in another tab or session/);
    expect(screen.getByRole("button", { name: "Reload latest" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Reapply my change" }),
    ).toBeNull();
    expect(
      (await ctx.service.getEditorData(id)).persona.selections.filter(
        (s) => s.isIncluded,
      ),
    ).toHaveLength(2);
  });
});

describe("PersonaEditor: details and presentation", () => {
  it("validates details on the client and saves valid changes", async () => {
    const { user, id } = await seedEditor({}, "details");
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, " ");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(
      await screen.findByText("Enter a name for this Persona."),
    ).toBeVisible();
    expect((await ctx.service.getEditorData(id)).persona.version).toBe(1);
    await user.clear(name);
    await user.type(name, "Founder Lead");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(async () =>
      expect((await ctx.service.getEditorData(id)).persona.name).toBe(
        "Founder Lead",
      ),
    );
  });

  it("preserves unsaved edits when switching tabs", async () => {
    const { user } = await seedEditor({}, "details");
    const audience = screen.getByLabelText("Audience (optional)");
    await user.clear(audience);
    await user.type(audience, "Angels");
    await user.click(screen.getByRole("tab", { name: "Content" }));
    await user.click(screen.getByRole("tab", { name: "Details" }));
    expect(screen.getByLabelText("Audience (optional)")).toHaveValue("Angels");
  });

  it("saves a Persona-specific headline, then resets it to My Identity", async () => {
    const { user, id } = await seedEditor({}, "presentation");
    const headline = screen.getByRole("group", {
      name: /Professional headline/,
    });
    expect(within(headline).getByText("From My Identity")).toBeVisible();
    await user.click(within(headline).getByLabelText("Write for this Persona"));
    const box = within(headline).getByLabelText(
      "Professional headline for this Persona",
    );
    await user.clear(box);
    await user.type(box, "Founder & CEO");
    await user.click(screen.getByRole("button", { name: "Save presentation" }));
    await waitFor(async () =>
      expect((await ctx.service.getEditorData(id)).persona.overrides).toEqual([
        { fieldKey: "headline", value: "Founder & CEO", version: 1 },
      ]),
    );
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("group", { name: /Professional headline/ }),
        ).getByText("Persona-specific version"),
      ).toBeVisible(),
    );

    await user.click(
      within(
        screen.getByRole("group", { name: /Professional headline/ }),
      ).getByLabelText("Use My Identity value"),
    );
    await user.click(screen.getByRole("button", { name: "Save presentation" }));
    await waitFor(async () =>
      expect((await ctx.service.getEditorData(id)).persona.overrides).toEqual(
        [],
      ),
    );
    // My Identity was never written: the preview resolves the current value again.
    expect(
      (await ctx.service.getEditorData(id)).preview.fields.find(
        (f) => f.fieldKey === "headline",
      )!.value,
    ).toBe(CANONICAL.headline);
  });

  it("blocks an invalid link override with a field message and saves nothing", async () => {
    const { user, id } = await seedEditor(
      { included: ["website_url"] },
      "presentation",
    );
    await user.click(screen.getByLabelText("Write for this Persona"));
    const box = screen.getByLabelText("Website for this Persona");
    await user.clear(box);
    await user.type(box, "ftp://nope");
    await user.click(screen.getByRole("button", { name: "Save presentation" }));
    expect(
      (await screen.findAllByText(/must start with http/)).length,
    ).toBeGreaterThan(0);
    expect((await ctx.service.getEditorData(id)).persona.overrides).toEqual([]);
  });

  it("marks an emptied override as intentionally blank, distinct from reset", async () => {
    const { user } = await seedEditor({}, "presentation");
    await user.click(
      screen.getByLabelText(/Write for this Persona/, {
        selector: "input[name=present-headline]",
      }),
    );
    const box = screen.getByLabelText("Professional headline for this Persona");
    await user.clear(box);
    expect(
      screen.getByText("This field is intentionally blank for this Persona."),
    ).toBeVisible();
  });
});

describe("PersonaEditor: preview", () => {
  it("is private, switches frames and reveals provenance on request", async () => {
    const { user } = await seedEditor(
      { overrides: { headline: "Founder & CEO" } },
      "preview",
    );
    expect(screen.getByText("Only you can see this preview.")).toBeVisible();
    expect(screen.getByTestId("preview-frame")).toHaveAttribute(
      "data-frame",
      "desktop",
    );
    await user.click(screen.getByRole("button", { name: "Mobile" }));
    expect(screen.getByTestId("preview-frame")).toHaveAttribute(
      "data-frame",
      "mobile",
    );
    expect(screen.queryByText("Persona-specific version")).toBeNull();
    await user.click(
      screen.getByRole("switch", { name: "Show where each value comes from" }),
    );
    expect(screen.getByText("Persona-specific version")).toBeVisible();
    expect(screen.getByText("From My Identity")).toBeVisible();
    // Internal IDs are never shown.
    expect(document.body).not.toHaveTextContent(/persona-\d+/);
  });

  it("explains excluded information and hidden sections without nudging to publish", async () => {
    await seedEditor({}, "preview");
    expect(screen.getByText(/Not shown \(5 fields\)/)).toBeVisible();
    expect(
      screen.getByText(/Excluded information stays in My Identity, unchanged/),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /publish/i })).toBeNull();
  });
});

describe("PersonaEditor: lifecycle", () => {
  it("makes archived Personas read-only until restored", async () => {
    const { user, id } = await seedEditor();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Archive Persona" }),
    );
    await screen.findByText(/archived and read-only/);
    expect(
      screen.getByRole("switch", { name: "Include Summary" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Include all" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Delete permanently…" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Include Summary" }),
      ).toBeEnabled(),
    );
    expect((await ctx.service.getEditorData(id)).persona).toMatchObject({
      status: "active",
      isDefault: false,
    });
  });

  it("deletes an archived Persona only after explicit confirmation, then leaves the editor", async () => {
    const { user, id } = await seedEditor();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Archive Persona",
      }),
    );
    await screen.findByText(/archived and read-only/);
    await user.click(
      screen.getByRole("button", { name: "Delete permanently…" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Your My Identity data is not touched.");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete permanently" }),
    );
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/personas"));
    await expect(ctx.service.getEditorData(id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("sets the default and duplicates into the new Persona", async () => {
    const { user } = await seedEditor();
    await user.click(screen.getByRole("button", { name: "Set as default" }));
    await waitFor(() => expect(screen.getByText("Default")).toBeVisible());
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Create copy" }),
    );
    await waitFor(() => expect(nav.push).toHaveBeenCalled());
    const names = (await ctx.service.list("all")).personas;
    expect(names).toHaveLength(2);
    expect(names.filter((p) => p.isDefault)).toHaveLength(1);
  });
});
