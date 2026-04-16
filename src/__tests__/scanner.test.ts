/**
 * Tests for file scanner and classifier.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scanFiles, classifyFile } from "../scanner.js";

describe("classifyFile", () => {
  it("should classify CLAUDE.md", () => {
    expect(classifyFile("CLAUDE.md")).toBe("claude-md");
    expect(classifyFile("project/CLAUDE.md")).toBe("claude-md");
  });

  it("should classify AGENTS.md", () => {
    expect(classifyFile("AGENTS.md")).toBe("agents-md");
  });

  it("should classify SOUL.md", () => {
    expect(classifyFile("SOUL.md")).toBe("soul-md");
  });

  it("should classify .cursorrules", () => {
    expect(classifyFile(".cursorrules")).toBe("cursorrules");
  });

  it("should classify .claude.json", () => {
    expect(classifyFile(".claude.json")).toBe("claude-json");
  });

  it("should classify claude_desktop_config.json", () => {
    expect(classifyFile("claude_desktop_config.json")).toBe("claude-json");
  });

  it("should classify .claude/settings.json", () => {
    expect(classifyFile(".claude/settings.json")).toBe("settings-json");
  });

  it("should classify .claude/settings.local.json", () => {
    expect(classifyFile(".claude/settings.local.json")).toBe("settings-json");
  });

  it("should classify .mcp.json", () => {
    expect(classifyFile(".mcp.json")).toBe("mcp-json");
  });

  it("should classify mcp.json", () => {
    expect(classifyFile("mcp.json")).toBe("mcp-json");
  });

  it("should classify hook scripts", () => {
    expect(classifyFile(".claude/hooks/pre-check.js")).toBe("hook-config");
    expect(classifyFile(".claude/hooks/lint.sh")).toBe("hook-config");
    expect(classifyFile(".hooks/validator.js")).toBe("hook-config");
  });

  it("should return null for unknown files", () => {
    expect(classifyFile("package.json")).toBeNull();
    expect(classifyFile("README.md")).toBeNull();
    expect(classifyFile("src/app.ts")).toBeNull();
  });

  it("should handle Windows-style paths", () => {
    expect(classifyFile(".claude\\settings.json")).toBe("settings-json");
    expect(classifyFile(".claude\\hooks\\test.js")).toBe("hook-config");
  });
});

describe("scanFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should find CLAUDE.md", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Test\n", { encoding: "utf-8" });
    const files = await scanFiles({ cwd: tmpDir });
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe("claude-md");
  });

  it("should find multiple file types", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Test\n", { encoding: "utf-8" });
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# Agents\n", { encoding: "utf-8" });
    fs.writeFileSync(path.join(tmpDir, ".mcp.json"), '{"mcpServers":{}}', { encoding: "utf-8" });
    const files = await scanFiles({ cwd: tmpDir });
    expect(files).toHaveLength(3);
    const types = files.map((f) => f.type);
    expect(types).toContain("claude-md");
    expect(types).toContain("agents-md");
    expect(types).toContain("mcp-json");
  });

  it("should skip node_modules", async () => {
    fs.mkdirSync(path.join(tmpDir, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "node_modules", "CLAUDE.md"), "# Test\n", { encoding: "utf-8" });
    const files = await scanFiles({ cwd: tmpDir });
    expect(files).toHaveLength(0);
  });

  it("should parse markdown content", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "## Section\nSome text\n", { encoding: "utf-8" });
    const files = await scanFiles({ cwd: tmpDir });
    expect(files[0].parsed).toBeDefined();
    expect(files[0].parsed?.kind).toBe("markdown");
  });

  it("should parse JSON content", async () => {
    fs.writeFileSync(path.join(tmpDir, ".mcp.json"), '{"mcpServers":{}}', { encoding: "utf-8" });
    const files = await scanFiles({ cwd: tmpDir });
    expect(files[0].parsed).toBeDefined();
    expect(files[0].parsed?.kind).toBe("json");
  });

  it("should report parse errors for invalid JSON", async () => {
    fs.writeFileSync(path.join(tmpDir, ".mcp.json"), "{invalid}", { encoding: "utf-8" });
    const files = await scanFiles({ cwd: tmpDir });
    expect(files[0].parseError).toBeDefined();
  });

  it("should handle custom ignore patterns", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Test\n", { encoding: "utf-8" });
    const files = await scanFiles({ cwd: tmpDir, ignore: ["CLAUDE.md"] });
    expect(files).toHaveLength(0);
  });

  it("should find .claude/settings.json", async () => {
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      '{"permissions":{}}',
      { encoding: "utf-8" }
    );
    const files = await scanFiles({ cwd: tmpDir });
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe("settings-json");
  });

  it("should handle empty directory", async () => {
    const files = await scanFiles({ cwd: tmpDir });
    expect(files).toHaveLength(0);
  });

  it("should find .cursorrules", async () => {
    fs.writeFileSync(path.join(tmpDir, ".cursorrules"), "# Cursor rules\n", { encoding: "utf-8" });
    const files = await scanFiles({ cwd: tmpDir });
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe("cursorrules");
  });

  it("should find SOUL.md", async () => {
    fs.writeFileSync(path.join(tmpDir, "SOUL.md"), "# Soul\n", { encoding: "utf-8" });
    const files = await scanFiles({ cwd: tmpDir });
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe("soul-md");
  });

  it("should normalize path separators", async () => {
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Test\n", { encoding: "utf-8" });
    const files = await scanFiles({ cwd: tmpDir });
    expect(files[0].path).not.toContain("\\");
  });
});
