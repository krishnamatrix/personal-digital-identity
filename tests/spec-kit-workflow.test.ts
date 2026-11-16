// @vitest-environment node
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Spec Kit feature selection on custom branches", () => {
  let root: string;
  let feature: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "folioone-spec-kit-"));
    cpSync(join(process.cwd(), ".specify"), join(root, ".specify"), {
      recursive: true,
    });
    rmSync(join(root, ".specify/feature.json"), { force: true });
    feature = join(root, "specs/001-example feature");
    mkdirSync(feature, { recursive: true });
    writeFileSync(join(feature, "spec.md"), "# Example\n");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function run(command: string, selected = "") {
    return spawnSync("bash", ["-c", command], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SPECIFY_FEATURE: "",
        SPECIFY_INIT_DIR: root,
        SPECIFY_FEATURE_DIRECTORY: selected,
      },
    });
  }

  const source = "source .specify/scripts/bash/common.sh; ";

  it("accepts an existing explicitly selected feature on feat/llms.txt", () => {
    const result = run(
      source + "check_feature_branch feat/llms.txt true",
      "specs/001-example feature",
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("accepts the persisted feature pointer on a custom branch", () => {
    writeFileSync(
      join(root, ".specify/feature.json"),
      JSON.stringify({ feature_directory: "specs/001-example feature" }),
    );
    expect(run(source + "check_feature_branch feat/llms.txt true").status).toBe(
      0,
    );
  });

  it("rejects a missing explicit feature even on a numbered branch", () => {
    const result = run(
      source + "check_feature_branch 001-example true",
      "specs/missing",
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Selected feature directory not found");
  });

  it("retains legacy branch checks when no feature is selected", () => {
    expect(run(source + "check_feature_branch feat/llms.txt true").status).toBe(
      1,
    );
    expect(run(source + "check_feature_branch 001-example true").status).toBe(
      0,
    );
  });

  it("uses the Folioone plan override when setting up a selected feature", () => {
    const result = run(
      "bash .specify/scripts/bash/setup-plan.sh --json",
      "specs/001-example feature",
    );
    expect(result.status).toBe(0);
    expect(readFileSync(join(feature, "plan.md"), "utf8")).toBe(
      readFileSync(
        join(root, ".specify/templates/overrides/plan-template.md"),
        "utf8",
      ),
    );
  });
});
