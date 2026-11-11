// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE = "https://proj.supabase.co";
const me = "0f00b3c8-7ea4-42ad-a544-4d62d1a42f54";
const other = "9a1d2c3b-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const imageId = "1b2c3d4e-5f60-4a7b-8c9d-aeb0c1d2e3f4";

const mocks = vi.hoisted(() => ({
  getAuthenticatedDb: vi.fn(),
  ensureAccount: vi.fn(),
  findProfile: vi.fn(),
  createEmptyProfile: vi.fn(),
  updateProfile: vi.fn(),
  uploadPrivateImage: vi.fn(),
  removePrivateImages: vi.fn(),
  signPrivateImage: vi.fn(),
  copyToPublicMedia: vi.fn(),
  listPublicMedia: vi.fn(),
  removePublicMedia: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  requireSupabaseConfig: () => ({ url: SUPABASE, anonKey: "anon" }),
}));
vi.mock("@/lib/server-log", () => ({ logLoadError: vi.fn() }));
vi.mock("@/lib/db/query", () => mocks);

import {
  parseOwnStoredImage,
  parseStoredImageRef,
  profileImagePath,
  publicImageUrl,
  publishedImagePath,
  storedImageRef,
} from "@/domains/media/media-paths";
import {
  MAX_PROFILE_IMAGE_BYTES,
  ProfileImageFileError,
  readProfileImageFile,
  sniffImage,
} from "@/domains/media/image-file";
import {
  cleanupPublishedImages,
  ownerImageUrl,
  preparePublishedImage,
  publishedImageUrl,
  removeMyProfileImage,
  uploadMyProfileImage,
} from "@/domains/media/profile-image-service";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = new TextEncoder().encode("RIFF\x00\x00\x00\x00WEBPVP8 ");

const myPath = profileImagePath(me, imageId, "webp");
const myRef = storedImageRef(SUPABASE, myPath);
const client = { tag: "client" };

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getAuthenticatedDb.mockResolvedValue({ client, user: { id: me } });
  mocks.findProfile.mockResolvedValue({ profileImageUrl: null });
  mocks.signPrivateImage.mockResolvedValue("https://signed.example/x");
  mocks.listPublicMedia.mockResolvedValue([]);
  mocks.removePrivateImages.mockResolvedValue(undefined);
  mocks.removePublicMedia.mockResolvedValue(undefined);
});

describe("media paths (folder structure)", () => {
  it("keeps the owner id as the first folder", () => {
    expect(myPath).toBe(`${me}/profile/${imageId}.webp`);
    expect(
      publishedImagePath({ accountId: me, imageId, ext: "jpg" }, "card"),
    ).toBe(`${me}/card/${imageId}.jpg`);
  });

  it("round-trips the stored reference and rejects anything else", () => {
    expect(myRef).toBe(
      `${SUPABASE}/storage/v1/object/authenticated/identity-media/${myPath}`,
    );
    expect(parseStoredImageRef(myRef, SUPABASE)).toEqual({
      accountId: me,
      imageId,
      ext: "webp",
      path: myPath,
    });
    expect(
      parseStoredImageRef("https://cdn.example/me.jpg", SUPABASE),
    ).toBeNull();
    expect(
      parseStoredImageRef(`${myRef.replace("/profile/", "/../")}`, SUPABASE),
    ).toBeNull();
    expect(parseStoredImageRef(`${myRef}.exe`, SUPABASE)).toBeNull();
    expect(parseStoredImageRef(myRef, "https://other.supabase.co")).toBeNull();
  });

  it("treats another person's object as not yours", () => {
    const theirs = storedImageRef(
      SUPABASE,
      profileImagePath(other, imageId, "png"),
    );
    expect(parseOwnStoredImage(theirs, SUPABASE, me)).toBeNull();
    expect(parseOwnStoredImage(myRef, SUPABASE, me)?.path).toBe(myPath);
  });
});

describe("image file checks", () => {
  it("detects the type from the bytes, not the name", () => {
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(JPEG)).toBe("jpg");
    expect(sniffImage(WEBP)).toBe("webp");
    expect(sniffImage(new TextEncoder().encode("<svg"))).toBeNull();
  });

  it("refuses empty, oversized and non-image files", async () => {
    await expect(
      readProfileImageFile(new File([], "a.png")),
    ).rejects.toBeInstanceOf(ProfileImageFileError);
    await expect(
      readProfileImageFile(
        new File([new Uint8Array(MAX_PROFILE_IMAGE_BYTES + 1)], "a.png"),
      ),
    ).rejects.toThrow("2 MB");
    await expect(
      readProfileImageFile(new File(["<svg onload=x>"], "a.png")),
    ).rejects.toThrow("JPEG, PNG or WebP");
    const ok = await readProfileImageFile(new File([WEBP], "photo.jpg"));
    expect(ok).toMatchObject({ ext: "webp", contentType: "image/webp" });
  });
});

describe("profile image upload", () => {
  it("verifies the session before reading the file", async () => {
    mocks.getAuthenticatedDb.mockRejectedValue(new Error("auth"));
    const file = new File([PNG], "a.png");
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(uploadMyProfileImage(file)).rejects.toThrow("auth");
    expect(read).not.toHaveBeenCalled();
    expect(mocks.uploadPrivateImage).not.toHaveBeenCalled();
  });

  it("stores the photo privately under the owner's folder and points the profile at it", async () => {
    const previous = storedImageRef(
      SUPABASE,
      profileImagePath(me, "2b2c3d4e-5f60-4a7b-8c9d-aeb0c1d2e3f4", "jpg"),
    );
    mocks.findProfile.mockResolvedValue({ profileImageUrl: previous });
    const result = await uploadMyProfileImage(new File([PNG], "a.png"));

    const [, path, , type] = mocks.uploadPrivateImage.mock.calls[0]!;
    expect(path).toMatch(new RegExp(`^${me}/profile/[0-9a-f-]{36}\\.png$`));
    expect(type).toBe("image/png");
    expect(mocks.updateProfile).toHaveBeenCalledWith(client, me, {
      profileImageUrl: storedImageRef(SUPABASE, path),
    });
    expect(mocks.removePrivateImages).toHaveBeenCalledWith(client, [
      parseStoredImageRef(previous, SUPABASE)!.path,
    ]);
    expect(result.displayUrl).toBe("https://signed.example/x");
  });

  it("removes the uploaded object again when the profile cannot be updated", async () => {
    mocks.updateProfile.mockRejectedValue(new Error("db"));
    await expect(
      uploadMyProfileImage(new File([JPEG], "a.jpg")),
    ).rejects.toThrow("db");
    const [, path] = mocks.uploadPrivateImage.mock.calls[0]!;
    expect(mocks.removePrivateImages).toHaveBeenCalledWith(client, [path]);
  });

  it("removing clears the profile and deletes only the owner's own object", async () => {
    mocks.findProfile.mockResolvedValue({ profileImageUrl: myRef });
    await removeMyProfileImage();
    expect(mocks.updateProfile).toHaveBeenCalledWith(client, me, {
      profileImageUrl: null,
    });
    expect(mocks.removePrivateImages).toHaveBeenCalledWith(client, [myPath]);

    mocks.removePrivateImages.mockReset();
    mocks.findProfile.mockResolvedValue({
      profileImageUrl: "https://cdn.example/me.jpg",
    });
    await removeMyProfileImage();
    expect(mocks.removePrivateImages).not.toHaveBeenCalled();
  });
});

describe("display and publishing", () => {
  it("shows the owner a signed URL, never someone else's object", async () => {
    expect(await ownerImageUrl(client as never, me, myRef)).toBe(
      "https://signed.example/x",
    );
    const theirs = storedImageRef(
      SUPABASE,
      profileImagePath(other, imageId, "png"),
    );
    expect(await ownerImageUrl(client as never, me, theirs)).toBeNull();
    expect(
      await ownerImageUrl(client as never, me, "https://cdn.example/me.jpg"),
    ).toBe("https://cdn.example/me.jpg");
  });

  it("publishes a public copy per surface at a deterministic URL", async () => {
    expect(publishedImageUrl(me, myRef, "website")).toBe(
      publicImageUrl(SUPABASE, `${me}/website/${imageId}.webp`),
    );
    expect(publishedImageUrl(me, myRef, "card")).toBe(
      `${SUPABASE}/storage/v1/object/public/public-media/${me}/card/${imageId}.webp`,
    );
    const theirs = storedImageRef(
      SUPABASE,
      profileImagePath(other, imageId, "png"),
    );
    expect(publishedImageUrl(me, theirs, "card")).toBeNull();

    await preparePublishedImage(client as never, me, myRef, "card");
    expect(mocks.copyToPublicMedia).toHaveBeenCalledWith(
      client,
      myPath,
      `${me}/card/${imageId}.webp`,
    );
    mocks.copyToPublicMedia.mockReset();
    await preparePublishedImage(
      client as never,
      me,
      "https://cdn.example/me.jpg",
      "card",
    );
    expect(mocks.copyToPublicMedia).not.toHaveBeenCalled();
  });

  it("cleans up public copies the live page no longer uses", async () => {
    const keep = `${me}/website/${imageId}.webp`;
    const stale = `${me}/website/2b2c3d4e-5f60-4a7b-8c9d-aeb0c1d2e3f4.jpg`;
    mocks.listPublicMedia.mockResolvedValue([keep, stale]);
    await cleanupPublishedImages(
      client as never,
      me,
      "website",
      publicImageUrl(SUPABASE, keep),
    );
    expect(mocks.removePublicMedia).toHaveBeenCalledWith(client, [stale]);

    await cleanupPublishedImages(client as never, me, "website", null);
    expect(mocks.removePublicMedia).toHaveBeenLastCalledWith(client, [
      keep,
      stale,
    ]);

    mocks.listPublicMedia.mockRejectedValue(new Error("storage down"));
    await expect(
      cleanupPublishedImages(client as never, me, "website", null),
    ).resolves.toBeUndefined();
  });
});

describe("M10 storage SQL", () => {
  const sql = readFileSync(
    join(process.cwd(), "docs/sql/milestone-10/001-profile-media-storage.sql"),
    "utf8",
  );
  const code = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("creates a private and a public bucket limited to 2 MB images", () => {
    expect(code).toContain(
      "('identity-media', 'identity-media', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])",
    );
    expect(code).toContain(
      "('public-media',   'public-media',   true,  2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])",
    );
  });

  it("only lets the owner touch their own folder, and never overwrite", () => {
    const policies = code.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    expect(policies).toHaveLength(6);
    for (const policy of policies) {
      expect(policy).toContain("TO authenticated");
      expect(policy).toContain(
        "(storage.foldername(name))[1] = (SELECT auth.uid())::text",
      );
    }
    expect(code).not.toMatch(
      /FOR UPDATE|TO anon|TO public|service_role|SECURITY DEFINER/,
    );
    expect(code).toContain(
      "'^[0-9a-f-]{36}/profile/[0-9a-f-]{36}\\.(jpg|png|webp)$'",
    );
    expect(code).toContain(
      "'^[0-9a-f-]{36}/(website|card)/[0-9a-f-]{36}\\.(jpg|png|webp)$'",
    );
  });
});
