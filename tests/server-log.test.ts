import { describe, expect, it } from "vitest";
import { buildRequestErrorLog, sanitizeMessage } from "@/lib/server-log";

describe("server request-error logging", () => {
  it("records where and what failed, using the route pattern, not the visited URL", () => {
    const record = buildRequestErrorLog(
      { name: "TypeError", message: "boom", digest: "abc123" },
      {
        method: "POST",
        path: "/personas/0f00b3c8-7ea4-42ad-a544-4d62d1a42f54?token=secret",
      },
      {
        routePath: "/personas/[id]",
        routeType: "action",
        routerKind: "App Router",
        renderSource: "server-rendering",
      },
    );
    expect(record).toMatchObject({
      level: "error",
      event: "request_error",
      route: "/personas/[id]",
      method: "POST",
      errorName: "TypeError",
      digest: "abc123",
    });
    expect(JSON.stringify(record)).not.toMatch(/token=secret|0f00b3c8/);
  });

  it("falls back to the path without its query string", () => {
    const record = buildRequestErrorLog(
      {},
      { method: "GET", path: "/profile?code=abc" },
      {},
    );
    expect(record.route).toBe("/profile");
    expect(record.errorName).toBe("Error");
  });

  it("masks e-mail addresses and long tokens and truncates", () => {
    const masked = sanitizeMessage(
      `failed for person@example.com with ${"a".repeat(40)} and ${"x".repeat(500)}`,
    );
    expect(masked).not.toMatch(/person@example\.com/);
    expect(masked).toContain("[email]");
    expect(masked).toContain("[token]");
    expect(masked.length).toBeLessThanOrEqual(200);
    expect(sanitizeMessage(undefined)).toBe("");
  });

  it("never includes headers, cookies or bodies", () => {
    const record = buildRequestErrorLog(
      { message: "x" },
      {
        method: "GET",
        path: "/a",
        headers: { cookie: "sb-token=abc" },
      } as never,
      {},
    );
    expect(JSON.stringify(record)).not.toMatch(/cookie|sb-token|headers/);
  });
});

describe("buildLoadErrorLog", () => {
  it("records the error class and database code, masking personal data", async () => {
    const { buildLoadErrorLog } = await import("@/lib/server-log");
    const { ProfilePersistenceError } = await import(
      "@/lib/db/queries/identity"
    );
    expect(
      buildLoadErrorLog("/profile", new ProfilePersistenceError("42703")),
    ).toMatchObject({
      event: "page_load_error",
      route: "/profile",
      errorName: "ProfilePersistenceError",
      code: "42703",
    });
    const record = buildLoadErrorLog("/website", {
      name: "Error",
      message: "failed for someone@example.com",
    });
    expect(record.code).toBeNull();
    expect(JSON.stringify(record)).not.toContain("someone@example.com");
  });
});
