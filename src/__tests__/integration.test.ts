/**
 * Integration tests — full linting scenarios with realistic config files.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { lint } from "../engine.js";

describe("integration: full project scan", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-int-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should lint a realistic CLAUDE.md", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      [
        "## Build Rules",
        "",
        "- Use TypeScript for all code",
        "- Run `npm test` before committing",
        "",
        "## Safety Gates",
        "",
        "- No force pushes to main",
        "- All PRs need review",
        "",
      ].join("\n"),
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    expect(report.filesScanned).toBe(1);
    // Should be mostly clean — well-structured CLAUDE.md
    expect(report.totalErrors).toBe(0);
  });

  it("should lint a realistic AGENTS.md with agents", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "AGENTS.md"),
      [
        "# Agent Definitions",
        "",
        "## Builder",
        "Builds the project. Uses TypeScript.",
        "",
        "## Evaluator",
        "Evaluates the project. Independent from Builder.",
        "",
        "## Reviewer",
        "Reviews code quality.",
        "",
      ].join("\n"),
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    expect(report.filesScanned).toBe(1);
    expect(report.totalErrors).toBe(0);
  });

  it("should detect issues in a bad MCP config", async () => {
    fs.writeFileSync(
      path.join(tmpDir, ".mcp.json"),
      "{bad json",
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    expect(report.totalErrors).toBeGreaterThanOrEqual(1);
    const jsonErrors = report.results.flatMap((r) =>
      r.diagnostics.filter((d) => d.ruleId === "struct-json-valid")
    );
    expect(jsonErrors.length).toBe(1);
  });

  it("should detect secrets in config files", async () => {
    fs.writeFileSync(
      path.join(tmpDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          myServer: {
            token: "ghp_1234567890abcdefghijklmnopqrstuvwxyz12",
          },
        },
      }),
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    const secretDiags = report.results.flatMap((r) =>
      r.diagnostics.filter((d) => d.ruleId === "sec-no-secrets-in-config")
    );
    expect(secretDiags.length).toBeGreaterThanOrEqual(1);
  });

  it("should detect dangerous hooks", async () => {
    const hooksDir = path.join(tmpDir, ".hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(
      path.join(hooksDir, "clean.sh"),
      "#!/bin/bash\nrm -rf /tmp/cache\n",
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    const hookDiags = report.results.flatMap((r) =>
      r.diagnostics.filter((d) => d.ruleId === "sec-no-dangerous-hooks")
    );
    expect(hookDiags.length).toBeGreaterThanOrEqual(1);
  });

  it("should cross-check CLAUDE.md and MCP config", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "## Tools\nUse mcp__phantom__do_thing for X\n",
      { encoding: "utf-8" }
    );
    fs.writeFileSync(
      path.join(tmpDir, ".mcp.json"),
      JSON.stringify({ mcpServers: { real_server: {} } }),
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    const syncDiags = report.results.flatMap((r) =>
      r.diagnostics.filter(
        (d) => d.ruleId === "con-claude-mcp-sync" || d.ruleId === "ref-tool-registered"
      )
    );
    expect(syncDiags.length).toBeGreaterThanOrEqual(1);
  });

  it("should handle a project with all file types", async () => {
    // CLAUDE.md
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "## Rules\nBuild stuff.\n", { encoding: "utf-8" });
    // AGENTS.md
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "## Builder\nBuilds.\n", { encoding: "utf-8" });
    // .cursorrules
    fs.writeFileSync(path.join(tmpDir, ".cursorrules"), "use typescript\n", { encoding: "utf-8" });
    // .mcp.json
    fs.writeFileSync(path.join(tmpDir, ".mcp.json"), '{"mcpServers":{}}', { encoding: "utf-8" });
    // .claude/settings.json
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      '{"permissions":{"allow":["Read","Write"]}}',
      { encoding: "utf-8" }
    );

    const report = await lint({ cwd: tmpDir });
    expect(report.filesScanned).toBeGreaterThanOrEqual(4);
  });

  it("should apply fixes correctly", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "## Test   \nClean\nAlso trailing   \n",
      { encoding: "utf-8" }
    );
    await lint({ cwd: tmpDir, fix: true });
    const content = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), { encoding: "utf-8" });
    expect(content).toBe("## Test\nClean\nAlso trailing\n");
  });

  it("should produce valid SARIF for CI", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "No headings.\n", { encoding: "utf-8" });
    const report = await lint({ cwd: tmpDir });
    // Import formatter and validate
    const { formatSarif } = await import("../formatters/sarif.js");
    const sarif = JSON.parse(formatSarif(report));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe("agentlint");
  });

  it("should produce valid JSON output", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "No headings.\n", { encoding: "utf-8" });
    const report = await lint({ cwd: tmpDir });
    const { formatJson } = await import("../formatters/json-formatter.js");
    const json = JSON.parse(formatJson(report));
    expect(json.version).toBe("1.0.0");
    expect(json.summary).toBeDefined();
  });

  it("should respect config file overrides", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "text   \n", { encoding: "utf-8" });
    fs.writeFileSync(
      path.join(tmpDir, ".agentlintrc.json"),
      JSON.stringify({
        rules: { "style-no-trailing-whitespace": "off" },
      }),
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    const trailingDiags = report.results.flatMap((r) =>
      r.diagnostics.filter((d) => d.ruleId === "style-no-trailing-whitespace")
    );
    expect(trailingDiags).toHaveLength(0);
  });

  it("should handle duplicate agents detection end-to-end", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "AGENTS.md"),
      "## Builder\nBuilds.\n## Tester\nTests.\n## Builder\nDuplicate.\n",
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    const dupDiags = report.results.flatMap((r) =>
      r.diagnostics.filter((d) => d.ruleId === "struct-no-duplicate-agents")
    );
    expect(dupDiags.length).toBe(1);
  });

  it("should handle settings with hooks referencing non-existent scripts", async () => {
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({
        hooks: {
          pre_check: [{ command: "node ./hooks/missing.js" }],
        },
      }),
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    const hookDiags = report.results.flatMap((r) =>
      r.diagnostics.filter((d) => d.ruleId === "ref-hook-script-exists")
    );
    expect(hookDiags.length).toBeGreaterThanOrEqual(1);
  });
});

describe("integration: edge cases", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-edge-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should handle empty CLAUDE.md", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "", { encoding: "utf-8" });
    const report = await lint({ cwd: tmpDir });
    // Should report structural issues but not crash
    expect(report.filesScanned).toBe(1);
  });

  it("should handle very large CLAUDE.md", async () => {
    const content = "## Section\n" + "x".repeat(100) + "\n".repeat(500);
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), content, { encoding: "utf-8" });
    const report = await lint({ cwd: tmpDir });
    expect(report.filesScanned).toBe(1);
  });

  it("should handle binary-looking content gracefully", async () => {
    fs.writeFileSync(path.join(tmpDir, ".mcp.json"), Buffer.from([0x00, 0x01, 0x02]), { encoding: "utf-8" });
    const report = await lint({ cwd: tmpDir });
    // Should report parse error but not crash
    expect(report.filesScanned).toBe(1);
  });

  it("should handle config with extends (no crash)", async () => {
    fs.writeFileSync(
      path.join(tmpDir, ".agentlintrc.json"),
      JSON.stringify({ extends: ["recommended"], rules: {} }),
      { encoding: "utf-8" }
    );
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "## Test\n", { encoding: "utf-8" });
    const report = await lint({ cwd: tmpDir });
    expect(report.filesScanned).toBeGreaterThanOrEqual(1);
  });

  it("should handle Unicode content", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "## 한글 제목\n내용입니다.\n## 日本語セクション\n",
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    expect(report.filesScanned).toBe(1);
  });

  it("should properly count diagnostics after quiet-mode filtering", async () => {
    // Simulate quiet mode: filter to errors only, recompute counts
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "No headings here.   \n",
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    // Should have warnings (trailing whitespace, no headings)
    expect(report.totalWarnings).toBeGreaterThanOrEqual(1);

    // Apply quiet-mode filtering (same logic as CLI)
    for (const result of report.results) {
      result.diagnostics = result.diagnostics.filter((d) => d.severity === "error");
    }
    report.results = report.results.filter((r) => r.diagnostics.length > 0);
    // Recompute summary counts
    const allDiags = report.results.flatMap((r) => r.diagnostics);
    report.totalErrors = allDiags.filter((d) => d.severity === "error").length;
    report.totalWarnings = allDiags.filter((d) => d.severity === "warning").length;
    report.totalInfos = allDiags.filter((d) => d.severity === "info").length;

    // After filtering: no errors means counts should be 0
    expect(report.totalErrors).toBe(0);
    expect(report.totalWarnings).toBe(0);
    expect(report.totalInfos).toBe(0);
  });

  it("should respect info severity in config (not fall through to default)", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "No headings at all.\n",
      { encoding: "utf-8" }
    );
    fs.writeFileSync(
      path.join(tmpDir, ".agentlintrc.json"),
      JSON.stringify({
        rules: {
          "struct-claude-md-sections": "info",
          "style-line-length": "off",
          "style-no-trailing-whitespace": "off",
          "ref-file-exists": "off",
          "ref-model-valid": "off",
        },
      }),
      { encoding: "utf-8" }
    );
    const report = await lint({ cwd: tmpDir });
    const sectionDiags = report.results.flatMap((r) =>
      r.diagnostics.filter((d) => d.ruleId === "struct-claude-md-sections")
    );
    expect(sectionDiags.length).toBeGreaterThanOrEqual(1);
    // Must be "info" severity, not the default "warning"
    for (const d of sectionDiags) {
      expect(d.severity).toBe("info");
    }
    // Should count as info, not warning
    expect(report.totalInfos).toBeGreaterThanOrEqual(1);
  });
});
