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
import {
  CANONICAL,
  createFlowInput,
  makeService,
} from "./helpers/persona-fixtures";

let ctx: ReturnType<typeof makeService>;
beforeEach(() => {
  nav.push.mockReset();
  ctx = makeService();
  holder.service = ctx.service;
});

async function editor(
  patch: Parameters<typeof createFlowInput>[0],
  tab: "details" | "content" | "presentation" | "preview",
) {
  const created = await ctx.service.create(createFlowInput(patch));
  render(
    <PersonaEditor
      initial={created}
      initialTab={tab}
      storageKind="in-memory-fixture"
    />,
  );
  return { id: created.persona.id, user: userEvent.setup(), created };
}

describe("Reapply never reverts changes the user did not make", () => {
  it("Details: reapplying a name edit keeps another tab's audience and description changes", async () => {
    const { id, user } = await editor({}, "details");
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Founder Lead");
    await ctx.service.updateDetails(id, 1, {
      name: "Founder",
      audience: "Angels",
      description: "remote description",
    });
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await screen.findAllByText(/changed in another tab or session/);
    await user.click(screen.getByRole("button", { name: "Reapply my change" }));
    await waitFor(async () =>
      expect((await ctx.service.getEditorData(id)).persona.name).toBe(
        "Founder Lead",
      ),
    );
    const saved = (await ctx.service.getEditorData(id)).persona;
    expect(saved.audience).toBe("Angels");
    expect(saved.description).toBe("remote description");
  });

  it("Sections: reapplying a visibility toggle keeps another tab's rename", async () => {
    const { id, user } = await editor({}, "content");
    await ctx.service.saveSection(id, 1, {
      sectionKey: "experience",
      label: "Work history",
      isVisible: false,
    });
    await user.click(
      screen.getByRole("switch", { name: "Show Experience section" }),
    );
    await screen.findAllByText(/changed in another tab or session/);
    await user.click(screen.getByRole("button", { name: "Reapply my change" }));
    await waitFor(async () =>
      expect(
        (await ctx.service.getEditorData(id)).persona.sections.find(
          (s) => s.sectionKey === "experience",
        )!.isVisible,
      ).toBe(true),
    );
    const section = (await ctx.service.getEditorData(id)).persona.sections.find(
      (s) => s.sectionKey === "experience",
    )!;
    expect(section.label).toBe("Work history");
  });

  it("Sections: reapplying a label save keeps another tab's visibility change", async () => {
    const { id, user } = await editor({}, "content");
    await user.type(screen.getByLabelText("Label for Skills"), "Toolbox");
    await ctx.service.saveSection(id, 1, {
      sectionKey: "skills",
      label: null,
      isVisible: true,
    });
    await user.click(screen.getByRole("button", { name: "Save label" }));
    await screen.findAllByText(/changed in another tab or session/);
    await user.click(screen.getByRole("button", { name: "Reapply my change" }));
    await waitFor(async () =>
      expect(
        (await ctx.service.getEditorData(id)).persona.sections.find(
          (s) => s.sectionKey === "skills",
        )!.label,
      ).toBe("Toolbox"),
    );
    const section = (await ctx.service.getEditorData(id)).persona.sections.find(
      (s) => s.sectionKey === "skills",
    )!;
    expect(section.isVisible).toBe(true);
  });
});

describe("Preview uses the same effective-content resolver as the editor", () => {
  it("the create-flow review and the saved editor preview render identical content", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <PersonaCreateFlow
        canonical={CANONICAL}
        canonicalAvailable
        storageKind="in-memory-fixture"
        starter="Founder"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("switch", { name: "Include Name" }));
    await user.click(
      screen.getByRole("switch", { name: "Include Professional headline" }),
    );
    await user.click(
      screen.getByRole("switch", { name: "Highlight Professional headline" }),
    );
    await user.click(screen.getByRole("switch", { name: "Include Location" }));
    await user.click(
      screen.getByRole("switch", { name: "Show Profile section" }),
    );
    await user.click(screen.getByRole("button", { name: "Move Location up" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getAllByLabelText("Write for this Persona")[0]);
    await user.clear(
      screen.getByLabelText("Professional headline for this Persona"),
    );
    await user.type(
      screen.getByLabelText("Professional headline for this Persona"),
      "Founder & CEO",
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    const reviewFrame = screen.getByTestId("preview-frame").textContent;
    expect(reviewFrame).toContain("Founder & CEO");
    await user.click(screen.getByRole("button", { name: "Create Persona" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalled());
    unmount();

    const id = nav.push.mock.calls[0][0].split("/").pop();
    const saved = await ctx.service.getEditorData(id);
    render(
      <PersonaEditor
        initial={saved}
        initialTab="preview"
        storageKind="in-memory-fixture"
      />,
    );
    expect(screen.getByTestId("preview-frame").textContent).toBe(reviewFrame);
  });

  it("the editor's preview data is exactly the resolver's output for the stored configuration", async () => {
    const { id } = await editor(
      {
        included: ["display_name", "summary"],
        overrides: { summary: "Custom" },
        visibleSections: ["profile"],
      },
      "preview",
    );
    const { resolvePersona } = await import(
      "@/domains/personas/persona-resolver"
    );
    const data = await ctx.service.getEditorData(id);
    expect(data.preview).toEqual(resolvePersona(data.persona, CANONICAL));
  });
});

describe("Hidden sections and excluded fields are never exposed in the preview", () => {
  it("shows no included field values when the Profile section is hidden", async () => {
    await editor(
      {
        included: ["display_name", "headline", "summary"],
        visibleSections: [],
      },
      "preview",
    );
    const frame = screen.getByTestId("preview-frame");
    for (const value of [
      "Alex Morgan",
      "Product leader",
      "I build thoughtful products.",
    ]) {
      expect(frame).not.toHaveTextContent(value);
    }
    expect(frame).toHaveTextContent("No sections are shown yet");
    expect(screen.getByText(/Profile section is hidden/)).toBeVisible();
  });

  it("shows included values once the Profile section is visible, and only those", async () => {
    await editor(
      { included: ["display_name"], visibleSections: ["profile"] },
      "preview",
    );
    const frame = screen.getByTestId("preview-frame");
    expect(frame).toHaveTextContent("Alex Morgan");
    expect(frame).not.toHaveTextContent("Product leader");
    expect(frame).not.toHaveTextContent("Lisbon");
  });

  it("never renders an excluded field's override or canonical value", async () => {
    await editor(
      {
        included: ["display_name"],
        overrides: { headline: "SECRET OVERRIDE" },
        visibleSections: ["profile"],
      },
      "preview",
    );
    const frame = screen.getByTestId("preview-frame");
    expect(frame).not.toHaveTextContent("SECRET OVERRIDE");
    expect(frame).not.toHaveTextContent("Product leader");
    expect(within(frame).queryByText("Professional headline")).toBeNull();
  });

  it("hides a section's fields again when the section is hidden after the fact", async () => {
    const { id, user } = await editor(
      { included: ["display_name"], visibleSections: ["profile"] },
      "content",
    );
    await user.click(
      screen.getByRole("switch", { name: "Show Profile section" }),
    );
    await waitFor(async () =>
      expect(
        (await ctx.service.getEditorData(id)).persona.sections.find(
          (s) => s.sectionKey === "profile",
        )!.isVisible,
      ).toBe(false),
    );
    await user.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByTestId("preview-frame")).not.toHaveTextContent(
      "Alex Morgan",
    );
  });
});
