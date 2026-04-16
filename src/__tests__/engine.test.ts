/**
 * Tests for the lint engine.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { lint } from "../engine.js";

describe("lint engine", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-engine-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return empty results for clean directory", async () => {
    const report = await lint({ cwd: tmpDir });
    expect(report.results).toHaveLength(0);
    expect(report.totalErrors).toBe(0);
    expect(report.totalWarnings).toBe(0);
    expect(report.filesScanned).toBe(0);
  });

  it("should scan and report issues", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "No headings here, just text.\n",
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    expect(report.filesScanned).toBe(1);
    expect(report.results.length).toBeGreaterThanOrEqual(1);
  });

  it("should filter by specific rules", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "No headings here, just text.   \n",
      { encoding: "utf-8" }
    );
    const report = await lint({
      cwd: tmpDir,
      rules: ["style-no-trailing-whitespace"],
    });
    const ruleIds = new Set(
      report.results.flatMap((r) => r.diagnostics.map((d) => d.ruleId))
    );
    expect(ruleIds.size).toBe(1);
    expect(ruleIds.has("style-no-trailing-whitespace")).toBe(true);
  });

  it("should respect ignore patterns", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "No headings\n",
      { encoding: "utf-8" }
    );
    const report = await lint({
      cwd: tmpDir,
      ignore: ["CLAUDE.md"],
    });
    expect(report.filesScanned).toBe(0);
  });

  it("should report durationMs", async () => {
    const report = await lint({ cwd: tmpDir });
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should count errors and warnings correctly", async () => {
    // Create a CLAUDE.md with trailing whitespace (warning) and
    // an invalid JSON file (error)
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "## Good heading   \n",
      { encoding: "utf-8" }
    );
    fs.writeFileSync(
      path.join(tmpDir, ".mcp.json"),
      "{invalid json}",
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    expect(report.totalErrors).toBeGreaterThanOrEqual(1);
    expect(report.totalWarnings).toBeGreaterThanOrEqual(1);
  });

  it("should report rulesApplied", async () => {
    const report = await lint({ cwd: tmpDir });
    expect(report.rulesApplied.length).toBeGreaterThanOrEqual(20);
  });

  it("should handle disabled rules via config", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "No headings   \n",
      { encoding: "utf-8" }
    );
    fs.writeFileSync(
      path.join(tmpDir, ".agentlintrc.json"),
      JSON.stringify({
        rules: {
          "struct-claude-md-sections": "off",
          "style-no-trailing-whitespace": "off",
          "style-line-length": "off",
        },
      }),
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    const ruleIds = report.results.flatMap((r) =>
      r.diagnostics.map((d) => d.ruleId)
    );
    expect(ruleIds).not.toContain("struct-claude-md-sections");
    expect(ruleIds).not.toContain("style-no-trailing-whitespace");
  });

  it("should apply fixes when fix=true", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "## Good heading   \nClean line\n",
      { encoding: "utf-8" }
    );
    await lint({ cwd: tmpDir, fix: true });
    const content = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), { encoding: "utf-8" });
    expect(content).toBe("## Good heading\nClean line\n");
  });

  it("should sort results by file path", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "text   \n", { encoding: "utf-8" });
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "text   \n", { encoding: "utf-8" });
    const report = await lint({ cwd: tmpDir });
    if (report.results.length >= 2) {
      expect(report.results[0].file.localeCompare(report.results[1].file)).toBeLessThanOrEqual(0);
    }
  });

  it("should sort diagnostics by line within a file", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "line1   \nline2   \nline3   \n",
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir, rules: ["style-no-trailing-whitespace"] });
    if (report.results.length > 0) {
      const diags = report.results[0].diagnostics;
      for (let i = 1; i < diags.length; i++) {
        expect(diags[i].line).toBeGreaterThanOrEqual(diags[i - 1].line);
      }
    }
  });

  it("should handle multiple file types simultaneously", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "## Test\n", { encoding: "utf-8" });
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "## Agent\n", { encoding: "utf-8" });
    fs.writeFileSync(path.join(tmpDir, ".mcp.json"), '{"mcpServers":{}}', { encoding: "utf-8" });
    fs.writeFileSync(path.join(tmpDir, ".cursorrules"), "# Rules\n", { encoding: "utf-8" });
    const report = await lint({ cwd: tmpDir });
    expect(report.filesScanned).toBe(4);
  });

  it("should honor info severity setting in config", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "No headings here, just text.\n",
      { encoding: "utf-8" }
    );
    fs.writeFileSync(
      path.join(tmpDir, ".agentlintrc.json"),
      JSON.stringify({
        rules: {
          "struct-claude-md-sections": "info",
          "style-no-trailing-whitespace": "off",
          "style-line-length": "off",
        },
      }),
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    const sectionDiags = report.results.flatMap((r) =>
      r.diagnostics.filter((d) => d.ruleId === "struct-claude-md-sections")
    );
    expect(sectionDiags.length).toBeGreaterThanOrEqual(1);
    // The severity should be "info" because user config says "info"
    expect(sectionDiags[0].severity).toBe("info");
    expect(report.totalInfos).toBeGreaterThanOrEqual(1);
  });
});
