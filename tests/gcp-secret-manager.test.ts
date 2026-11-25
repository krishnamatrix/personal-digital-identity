// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGcpTokenCache,
  GcpSecretManagerClient,
  getGcpAccessToken,
  isGcpSecretManagerConfigured,
  loadRuntimeSecrets,
  resolveSecretProviderMode,
  SecretAccessError,
  SecretConfigurationError,
  SecretNotFoundError,
  SecretService,
  SecretValidationError,
} from "@/lib/secrets";

const ENV_KEYS = [
  "SECRET_PROVIDER",
  "GCP_PROJECT_ID",
  "GOOGLE_CLOUD_PROJECT",
  "GCP_SERVICE_ACCOUNT_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GCP_ACCESS_TOKEN",
  "SECRET_CACHE_TTL_MS",
  "TEST_LOCAL_SECRET",
] as const;

describe("Google Cloud Secret Manager service layer", () => {
  const savedEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    clearGcpTokenCache();
    for (const key of ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    clearGcpTokenCache();
    for (const [key, val] of savedEnv.entries()) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    vi.restoreAllMocks();
  });

  it("validates project ID, secret name, and version to block path traversal", async () => {
    const client = new GcpSecretManagerClient({
      projectId: "my-gcp-project-123",
      getToken: async () => "token",
    });

    await expect(client.accessSecret("../other-secret")).rejects.toThrow(
      SecretValidationError,
    );
    await expect(client.accessSecret("valid_secret", "abc")).rejects.toThrow(
      SecretValidationError,
    );

    const badProject = new GcpSecretManagerClient({
      projectId: "../evil",
      getToken: async () => "token",
    });
    await expect(badProject.accessSecret("valid_secret")).rejects.toThrow(
      SecretValidationError,
    );
  });

  it("fetches, decodes base64 UTF-8 secrets, caches within TTL, and supports invalidation", async () => {
    let now = 1_000_000;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          payload: {
            data: Buffer.from("super-secret-value-✓", "utf8").toString(
              "base64",
            ),
          },
        }),
        { status: 200 },
      ),
    );

    const client = new GcpSecretManagerClient({
      projectId: "folioone-prod-01",
      ttlMs: 60_000,
      fetchImpl: fetchMock as unknown as typeof fetch,
      getToken: async () => "bearer-token-123",
      nowMs: () => now,
    });

    const first = await client.accessSecret("LLM_API_KEY");
    expect(first).toBe("super-secret-value-✓");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://secretmanager.googleapis.com/v1/projects/folioone-prod-01/secrets/LLM_API_KEY/versions/latest:access",
    );

    // Cache hit within TTL
    const second = await client.accessSecret("LLM_API_KEY");
    expect(second).toBe("super-secret-value-✓");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After TTL expiry, fetches again
    now += 61_000;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          payload: {
            data: Buffer.from("rotated-secret", "utf8").toString("base64"),
          },
        }),
        { status: 200 },
      ),
    );
    const third = await client.accessSecret("LLM_API_KEY");
    expect(third).toBe("rotated-secret");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Explicit invalidation forces refetch
    client.invalidate("LLM_API_KEY");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          payload: {
            data: Buffer.from("fresh-secret", "utf8").toString("base64"),
          },
        }),
        { status: 200 },
      ),
    );
    expect(await client.accessSecret("LLM_API_KEY")).toBe("fresh-secret");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps 404, 403, and network errors safely without leaking tokens or values", async () => {
    const makeClient = (fetchMock: unknown) =>
      new GcpSecretManagerClient({
        projectId: "folioone-prod-01",
        fetchImpl: fetchMock as typeof fetch,
        getToken: async () => "very-sensitive-bearer-token",
      });

    await expect(
      makeClient(
        vi.fn().mockResolvedValue(new Response("", { status: 404 })),
      ).accessSecret("MISSING_KEY"),
    ).rejects.toThrow(SecretNotFoundError);

    try {
      await makeClient(
        vi.fn().mockResolvedValue(new Response("secret body", { status: 403 })),
      ).accessSecret("LOCKED_KEY");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SecretAccessError);
      expect((err as SecretAccessError).code).toBe("gcp_secret_unauthorized");
      expect((err as Error).message).not.toContain(
        "very-sensitive-bearer-token",
      );
    }

    await expect(
      makeClient(
        vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      ).accessSecret("NET_KEY"),
    ).rejects.toThrow(SecretAccessError);
  });

  it("exchanges an RS256 signed JWT for a GCP access token and caches it", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    process.env.GCP_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "folioone@folioone-prod-01.iam.gserviceaccount.com",
      private_key: privateKey,
      token_uri: "https://oauth2.googleapis.com/token",
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "ya29.signed-token",
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    );

    const token1 = await getGcpAccessToken({
      fetchImpl: fetchMock as unknown as typeof fetch,
      nowMs: () => 2_000_000,
    });
    const token2 = await getGcpAccessToken({
      fetchImpl: fetchMock as unknown as typeof fetch,
      nowMs: () => 2_010_000,
    });

    expect(token1).toBe("ya29.signed-token");
    expect(token2).toBe("ya29.signed-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("supports auto, env, and strict gcp modes in SecretService", async () => {
    process.env.TEST_LOCAL_SECRET = "local-dev-value";
    expect(isGcpSecretManagerConfigured()).toBe(false);

    // auto without GCP_PROJECT_ID falls back to process.env
    const autoService = new SecretService();
    expect(await autoService.getSecret("TEST_LOCAL_SECRET")).toBe(
      "local-dev-value",
    );

    // strict gcp mode without GCP_PROJECT_ID throws SecretConfigurationError
    process.env.SECRET_PROVIDER = "gcp";
    await expect(autoService.getSecret("TEST_LOCAL_SECRET")).rejects.toThrow(
      SecretConfigurationError,
    );

    // auto with GCP_PROJECT_ID uses GCP first and falls back to env on 404
    process.env.SECRET_PROVIDER = "auto";
    process.env.GCP_PROJECT_ID = "folioone-prod-01";
    expect(isGcpSecretManagerConfigured()).toBe(true);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            payload: {
              data: Buffer.from("from-gcp", "utf8").toString("base64"),
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("", { status: 404 }));

    const service = new SecretService({
      fetchImpl: fetchMock as unknown as typeof fetch,
      getToken: async () => "token",
    });

    const batch = await service.getSecrets(["CLOUD_KEY", "TEST_LOCAL_SECRET"]);
    expect(batch).toEqual({
      CLOUD_KEY: "from-gcp",
      TEST_LOCAL_SECRET: "local-dev-value",
    });

    // requireSecret throws when missing everywhere
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(service.requireSecret("DOES_NOT_EXIST")).rejects.toThrow(
      SecretNotFoundError,
    );
  });

  it("defaults to strict gcp in production and auto (local env) in development", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      vi.stubEnv("NODE_ENV", "development");
      expect(resolveSecretProviderMode()).toBe("auto");

      vi.stubEnv("NODE_ENV", "production");
      expect(resolveSecretProviderMode()).toBe("gcp");

      // In production without GCP_PROJECT_ID, loadRuntimeSecrets refuses local fallback.
      await expect(loadRuntimeSecrets(new SecretService())).rejects.toThrow(
        SecretConfigurationError,
      );

      // With GCP_PROJECT_ID set, LLM_API_KEY resolves via alias "folio-one-llm-api-key".
      process.env.GCP_PROJECT_ID = "folioone-prod-01";
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/secrets/folio-one-llm-api-key/")) {
          return new Response(
            JSON.stringify({
              payload: {
                data: Buffer.from("prod-llm-key", "utf8").toString("base64"),
              },
            }),
            { status: 200 },
          );
        }
        return new Response("", { status: 404 });
      });

      const secrets = await loadRuntimeSecrets(
        new SecretService({
          fetchImpl: fetchMock as unknown as typeof fetch,
          getToken: async () => "prod-token",
        }),
      );
      expect(secrets.LLM_API_KEY).toBe("prod-llm-key");
      expect(secrets.RAZORPAY_KEY_ID).toBeNull();
    } finally {
      vi.unstubAllEnvs();
      if (prevNodeEnv !== undefined) vi.stubEnv("NODE_ENV", prevNodeEnv);
    }
  });
});
