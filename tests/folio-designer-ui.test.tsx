import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const publishActionMock = vi.fn();
vi.mock("@/app/designer/actions", () => ({
  publishFolioDesignerAction: (input: unknown) => publishActionMock(input),
}));

import { DesignerWorkspace } from "@/app/designer/designer-workspace";

describe("DesignerWorkspace", () => {
  it("blocks generate for short prompts client-side", async () => {
    const user = userEvent.setup();
    render(<DesignerWorkspace />);
    await user.type(screen.getByLabelText(/design prompt/i), "too short");
    await user.click(screen.getByRole("button", { name: /generate design/i }));
    expect(
      screen.getByText(/at least 20 characters/i, { selector: "p" }),
    ).toBeInTheDocument();
  });

  it("renders sandboxed live iframe preview and flags stale preview after editing prompt", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          html: "<!DOCTYPE html><html><head><title>Jamie Cinematic</title></head><body><h1>Jamie</h1></body></html>",
          title: "Jamie Cinematic",
          identityFieldsUsed: ["displayName", "headline"],
          generatedAt: new Date().toISOString(),
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DesignerWorkspace siteSlug="jamie" />);
    const field = screen.getByLabelText(/design prompt/i);
    await user.type(field, "Create a cinematic scroll portfolio page");
    await user.click(screen.getByRole("button", { name: /generate design/i }));

    const iframe = await screen.findByTitle(/live preview: jamie cinematic/i);
    expect(iframe).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
    expect(iframe.getAttribute("srcdoc")).toContain("<h1>Jamie</h1>");
    expect(screen.getByText(/personalized with: displayName, headline/i)).toBeInTheDocument();

    // Confirm publish calls server action and shows live link
    publishActionMock.mockResolvedValueOnce({
      ok: true,
      slug: "jamie",
      message: "Published live at /jamie.",
    });
    await user.click(screen.getByRole("button", { name: /publish to \/jamie/i }));
    await user.click(screen.getByRole("button", { name: /confirm publish/i }));
    expect(publishActionMock).toHaveBeenCalledWith({
      html: "<!DOCTYPE html><html><head><title>Jamie Cinematic</title></head><body><h1>Jamie</h1></body></html>",
      title: "Jamie Cinematic",
    });
    expect(await screen.findByRole("link", { name: /view live site/i })).toHaveAttribute(
      "href",
      "/jamie",
    );

    // Expand prompt again and edit it -> stale notice appears
    await user.click(screen.getByRole("button", { name: /edit prompt/i }));
    await user.type(screen.getByLabelText(/design prompt/i), " with dark sky");
    expect(
      screen.getByText(/prompt changed after this preview was generated/i),
    ).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
