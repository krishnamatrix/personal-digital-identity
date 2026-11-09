import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

import PersonasError from "@/app/personas/error";
import PersonasLoading from "@/app/personas/loading";
import PersonaNotFound, {
  metadata as notFoundMetadata,
} from "@/app/personas/not-found";
import { metadata as listMetadata } from "@/app/personas/page";
import { metadata as newMetadata } from "@/app/personas/new/page";
import { generateMetadata as editMetadata } from "@/app/personas/[id]/page";
import { PersonaCreateFlow } from "@/app/personas/persona-create-flow";
import { PersonaEditor } from "@/app/personas/persona-editor";
import { PersonaList } from "@/app/personas/persona-list";
import { Dashboard } from "@/components/workspace/dashboard";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import {
  CANONICAL,
  createFlowInput,
  makeService,
} from "./helpers/persona-fixtures";

let ctx: ReturnType<typeof makeService>;
beforeEach(() => {
  nav.push.mockReset();
  nav.refresh.mockReset();
  ctx = makeService();
  holder.service = ctx.service;
});

/** A service whose every call fails as if the session had lapsed. */
const signedOutService = () =>
  new Proxy(
    {},
    {
      get: () => async () => {
        throw new AuthenticationRequiredError();
      },
    },
  );

const beforeUnloadPrevented = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("route states", () => {
  it("not found is a branded page inside the workspace, with a way back, and reveals nothing", () => {
    render(<PersonaNotFound />);
    expect(
      screen.getByRole("heading", { name: "Persona not found" }),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Workspace navigation" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to Personas" }),
    ).toHaveAttribute("href", "/personas");
    expect(document.body).toHaveTextContent(
      /does not exist or is not available to you/,
    );
    expect(document.body).not.toHaveTextContent(/another account|belongs to/i);
    expect(notFoundMetadata.title).toBe("Persona not found");
  });

  it("the error boundary offers retry and shows no failure details", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(
      <PersonasError
        error={new Error("secret stack postgres://x")}
        reset={reset}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(document.body).not.toHaveTextContent(/secret|postgres/);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("link", { name: "Back to Personas" }),
    ).toHaveAttribute("href", "/personas");
  });

  it("the loading state is announced politely and keeps the workspace chrome", () => {
    render(<PersonasLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading Personas…");
    expect(
      screen.getByRole("navigation", { name: "Workspace navigation" }),
    ).toBeVisible();
  });

  it("each Persona page has its own title", async () => {
    expect(listMetadata.title).toBe("Personas");
    expect(newMetadata.title).toBe("Create Persona");
    const created = await ctx.service.create(
      createFlowInput({ name: "Founder" }),
    );
    const params = (id: string) => Promise.resolve({ id });
    // The editor's title is the Persona's own name...
    expect(await editMetadata({ params: params(created.persona.id) })).toEqual({
      title: "Founder",
    });
    // ...a missing Persona says so, and a signed-out request reveals nothing.
    expect(
      await editMetadata({
        params: params("00000000-0000-4000-8000-000000000000"),
      }),
    ).toEqual({ title: "Persona not found" });
    holder.service = signedOutService();
    expect(await editMetadata({ params: params(created.persona.id) })).toEqual({
      title: "Persona",
    });
  });
});

describe("a lapsed session offers a way back and keeps the user's work", () => {
  it("editor: shows a signed-out alert with a Sign in link and keeps unsaved edits", async () => {
    const created = await ctx.service.create(
      createFlowInput({ included: ["headline"], visibleSections: ["profile"] }),
    );
    const user = userEvent.setup();
    render(
      <PersonaEditor
        initial={created}
        initialTab="details"
        storageKind="in-memory-fixture"
      />,
    );
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Unsaved name");
    holder.service = signedOutService();
    await user.click(screen.getByRole("button", { name: "Save details" }));
    const alert = (await screen.findAllByText("You have been signed out"))[0];
    expect(alert).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByText(/Your unsaved edits on this page are still here/),
    ).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Unsaved name");
  });

  it("list: shows the signed-out alert with a Sign in link", async () => {
    const a = await ctx.service.create(createFlowInput({ name: "Founder" }));
    const list = await ctx.service.list("active");
    holder.service = signedOutService();
    const user = userEvent.setup();
    render(
      <PersonaList {...list} filter="active" storageKind="in-memory-fixture" />,
    );
    await user.click(screen.getByRole("button", { name: "Set as default" }));
    expect(await screen.findByText("You have been signed out")).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(a.persona.name).toBe("Founder");
  });

  it("create flow: keeps the draft and offers Sign in", async () => {
    const user = userEvent.setup();
    render(
      <PersonaCreateFlow
        canonical={CANONICAL}
        canonicalAvailable
        storageKind="in-memory-fixture"
        starter="Founder"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    holder.service = signedOutService();
    await user.click(screen.getByRole("button", { name: "Create Persona" }));
    expect(
      (await screen.findAllByText("You have been signed out"))[0],
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("heading", { name: "Review" })).toBeVisible();
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("unsaved work is protected against closing the tab", () => {
  it("editor: warns only while there are unsaved edits", async () => {
    const created = await ctx.service.create(createFlowInput());
    const user = userEvent.setup();
    render(
      <PersonaEditor
        initial={created}
        initialTab="details"
        storageKind="in-memory-fixture"
      />,
    );
    expect(beforeUnloadPrevented()).toBe(false);
    await user.type(screen.getByLabelText("Audience (optional)"), "x");
    expect(beforeUnloadPrevented()).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(beforeUnloadPrevented()).toBe(false));
  });

  it("editor: removes the warning when it unmounts", async () => {
    const created = await ctx.service.create(createFlowInput());
    const user = userEvent.setup();
    const { unmount } = render(
      <PersonaEditor
        initial={created}
        initialTab="details"
        storageKind="in-memory-fixture"
      />,
    );
    await user.type(screen.getByLabelText("Audience (optional)"), "x");
    expect(beforeUnloadPrevented()).toBe(true);
    unmount();
    expect(beforeUnloadPrevented()).toBe(false);
  });

  it("create flow: warns once the draft changes, and not after a successful create", async () => {
    const user = userEvent.setup();
    render(
      <PersonaCreateFlow
        canonical={CANONICAL}
        canonicalAvailable
        storageKind="in-memory-fixture"
      />,
    );
    expect(beforeUnloadPrevented()).toBe(false);
    await user.type(screen.getByLabelText("Name"), "Draft");
    expect(beforeUnloadPrevented()).toBe(true);
    for (let i = 0; i < 3; i++)
      await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create Persona" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalled());
    expect(beforeUnloadPrevented()).toBe(false);
  });
});

describe("responsive row layout and the dashboard", () => {
  it("keeps Highlight and the move buttons together so they wrap as one unit", async () => {
    const created = await ctx.service.create(createFlowInput());
    render(
      <PersonaEditor
        initial={created}
        initialTab="content"
        storageKind="in-memory-fixture"
      />,
    );
    const highlight = screen.getByRole("switch", { name: "Highlight Name" });
    const group = highlight.closest("div.ml-auto") as HTMLElement;
    expect(group).not.toBeNull();
    expect(
      within(group).getByRole("button", { name: "Move Name down" }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("button", { name: "Move Name up" }),
    ).toBeInTheDocument();
  });

  it("dashboard links to the real Personas and no longer presents samples as navigable", () => {
    render(<Dashboard />);
    expect(
      screen.getByRole("link", { name: "Manage personas" }),
    ).toHaveAttribute("href", "/personas");
    expect(screen.getByRole("link", { name: "New persona" })).toHaveAttribute(
      "href",
      "/personas/new",
    );
    const samples = screen.getAllByText(/^Example · /);
    expect(samples).toHaveLength(2);
    const card = samples[0].closest("article")!;
    expect(within(card).queryByRole("link")).toBeNull();
    expect(card.querySelector("svg")).toBeNull();
    fireEvent.click(card); // inert: no navigation
    expect(nav.push).not.toHaveBeenCalled();
  });
});
