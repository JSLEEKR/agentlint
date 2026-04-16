/**
 * Tests for reference rules.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { RuleContext, ParsedFile, LintDiagnostic, JsonParsed } from "../types.js";
import { getDefaultConfig } from "../config.js";
import {
  refFileExists,
  refToolRegistered,
  refModelValid,
  refHookScriptExists,
} from "../rules/ref-rules.js";
import { parseMarkdown } from "../parsers/markdown.js";

function makeContext(
  file: ParsedFile,
  allFiles?: ParsedFile[],
  projectRoot?: string
): {
  ctx: RuleContext;
  diagnostics: LintDiagnostic[];
} {
  const diagnostics: LintDiagnostic[] = [];
  const ctx: RuleContext = {
    file,
    allFiles: allFiles ?? [file],
    projectRoot: projectRoot ?? "/test",
    config: getDefaultConfig(),
    report(diag) {
      diagnostics.push({
        ...diag,
        ruleId: "test",
        category: "ref",
        severity: diag.severity ?? "warning",
      });
    },
  };
  return { ctx, diagnostics };
}

function makeMdFile(content: string, type: "claude-md" | "agents-md" = "claude-md"): ParsedFile {
  const lines = content.split("\n");
  return {
    path: type === "claude-md" ? "CLAUDE.md" : "AGENTS.md",
    type,
    content,
    lines,
    parsed: parseMarkdown(content, lines),
  };
}

describe("ref-file-exists", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-ref-"));
    fs.writeFileSync(path.join(tmpDir, "exists.md"), "content", { encoding: "utf-8" });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should warn on non-existent referenced file", () => {
    const content = "See ./nonexistent.md for details\n";
    const file = makeMdFile(content);
    const { ctx, diagnostics } = makeContext(file, undefined, tmpDir);
    refFileExists.check(ctx);
    const refWarnings = diagnostics.filter((d) => d.message.includes("does not exist"));
    expect(refWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("should pass on existing referenced file", () => {
    const content = "See ./exists.md for details\n";
    const file = makeMdFile(content);
    const { ctx, diagnostics } = makeContext(file, undefined, tmpDir);
    refFileExists.check(ctx);
    const refWarnings = diagnostics.filter((d) => d.message.includes("does not exist"));
    expect(refWarnings).toHaveLength(0);
  });

  it("should skip URL references", () => {
    const content = "See https://example.com/file.md\n";
    const file = makeMdFile(content);
    const { ctx, diagnostics } = makeContext(file, undefined, tmpDir);
    refFileExists.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should skip template/variable references", () => {
    const content = "Use ${HOME}/config.md\n";
    const file = makeMdFile(content);
    const { ctx, diagnostics } = makeContext(file, undefined, tmpDir);
    refFileExists.check(ctx);
    const refWarnings = diagnostics.filter((d) => d.message.includes("does not exist"));
    expect(refWarnings).toHaveLength(0);
  });

  it("should skip wildcard patterns", () => {
    // Wildcards in explicit path references should be skipped
    const content = 'Check "src/**/*.ts" for the code\n';
    const file = makeMdFile(content);
    const { ctx, diagnostics } = makeContext(file, undefined, tmpDir);
    refFileExists.check(ctx);
    const refWarnings = diagnostics.filter((d) => d.message.includes("does not exist"));
    // The glob pattern should be skipped due to wildcard
    expect(refWarnings).toHaveLength(0);
  });
});

describe("ref-tool-registered", () => {
  it("should warn on unregistered MCP server reference", () => {
    const claudeFile = makeMdFile("Use mcp__unknown_server__some_tool for testing\n");
    const mcpFile: ParsedFile = {
      path: ".mcp.json",
      type: "mcp-json",
      content: '{"mcpServers":{"known_server":{}}}',
      lines: ['{"mcpServers":{"known_server":{}}}'],
      parsed: { kind: "json", data: { mcpServers: { known_server: {} } } },
    };
    const { ctx, diagnostics } = makeContext(claudeFile, [claudeFile, mcpFile]);
    refToolRegistered.check(ctx);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("unknown_server");
  });

  it("should pass on registered MCP server reference", () => {
    const claudeFile = makeMdFile("Use mcp__known_server__some_tool for testing\n");
    const mcpFile: ParsedFile = {
      path: ".mcp.json",
      type: "mcp-json",
      content: '{"mcpServers":{"known_server":{}}}',
      lines: ['{"mcpServers":{"known_server":{}}}'],
      parsed: { kind: "json", data: { mcpServers: { known_server: {} } } },
    };
    const { ctx, diagnostics } = makeContext(claudeFile, [claudeFile, mcpFile]);
    refToolRegistered.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should skip when no MCP configs found", () => {
    const claudeFile = makeMdFile("Use mcp__server__tool\n");
    const { ctx, diagnostics } = makeContext(claudeFile);
    refToolRegistered.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should detect multiple unregistered servers", () => {
    const content = "Use mcp__foo__bar and mcp__baz__qux\n";
    const claudeFile = makeMdFile(content);
    const mcpFile: ParsedFile = {
      path: ".mcp.json",
      type: "mcp-json",
      content: '{"mcpServers":{"other":{}}}',
      lines: ['{"mcpServers":{"other":{}}}'],
      parsed: { kind: "json", data: { mcpServers: { other: {} } } },
    };
    const { ctx, diagnostics } = makeContext(claudeFile, [claudeFile, mcpFile]);
    refToolRegistered.check(ctx);
    expect(diagnostics).toHaveLength(2);
  });
});

describe("ref-model-valid", () => {
  it("should pass on known model names", () => {
    const file = makeMdFile("Use claude-sonnet-4-20250514 for generation\n");
    const { ctx, diagnostics } = makeContext(file);
    refModelValid.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should warn on unknown model names", () => {
    const file = makeMdFile("Use claude-sonnet-99-20250514 for generation\n");
    const { ctx, diagnostics } = makeContext(file);
    refModelValid.check(ctx);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("Unknown model name");
  });

  it("should suggest closest model for typos", () => {
    const file = makeMdFile("Use claude-sonet-4-20250514\n");
    const { ctx, diagnostics } = makeContext(file);
    refModelValid.check(ctx);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("Did you mean");
  });

  it("should handle GPT models", () => {
    const file = makeMdFile("Use gpt-4o for testing\n");
    const { ctx, diagnostics } = makeContext(file);
    refModelValid.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should handle Gemini models", () => {
    const file = makeMdFile("Use gemini-2.5-pro for testing\n");
    const { ctx, diagnostics } = makeContext(file);
    refModelValid.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should detect unknown model in JSON config", () => {
    const file: ParsedFile = {
      path: ".claude.json",
      type: "claude-json",
      content: '{"model":"claude-fake-99"}',
      lines: ['{"model":"claude-fake-99"}'],
      parsed: { kind: "json", data: { model: "claude-fake-99" } },
    };
    const { ctx, diagnostics } = makeContext(file);
    refModelValid.check(ctx);
    expect(diagnostics).toHaveLength(1);
  });

  it("should handle multiple models on one line", () => {
    const file = makeMdFile("Use gpt-4o or claude-sonnet-4 as fallback\n");
    const { ctx, diagnostics } = makeContext(file);
    refModelValid.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });
});

describe("ref-hook-script-exists", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-hook-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should error when hook script does not exist", () => {
    const file: ParsedFile = {
      path: ".claude/settings.json",
      type: "settings-json",
      content: '{"hooks":{"pre_check":[{"command":"node nonexistent.js"}]}}',
      lines: ['{"hooks":{"pre_check":[{"command":"node nonexistent.js"}]}}'],
      parsed: {
        kind: "json",
        data: { hooks: { pre_check: [{ command: "node nonexistent.js" }] } },
      },
    };
    const { ctx, diagnostics } = makeContext(file, undefined, tmpDir);
    refHookScriptExists.check(ctx);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("non-existent script");
  });

  it("should pass when hook script exists", () => {
    fs.writeFileSync(path.join(tmpDir, "hook.js"), "// hook", { encoding: "utf-8" });
    const file: ParsedFile = {
      path: ".claude/settings.json",
      type: "settings-json",
      content: '{"hooks":{"pre_check":[{"command":"node hook.js"}]}}',
      lines: ['{"hooks":{"pre_check":[{"command":"node hook.js"}]}}'],
      parsed: {
        kind: "json",
        data: { hooks: { pre_check: [{ command: "node hook.js" }] } },
      },
    };
    const { ctx, diagnostics } = makeContext(file, undefined, tmpDir);
    refHookScriptExists.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should handle missing hooks section", () => {
    const file: ParsedFile = {
      path: ".claude/settings.json",
      type: "settings-json",
      content: '{"permissions":{}}',
      lines: ['{"permissions":{}}'],
      parsed: { kind: "json", data: { permissions: {} } },
    };
    const { ctx, diagnostics } = makeContext(file, undefined, tmpDir);
    refHookScriptExists.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should skip non-settings files", () => {
    const file: ParsedFile = {
      path: ".mcp.json",
      type: "mcp-json",
      content: '{}',
      lines: ['{}'],
      parsed: { kind: "json", data: {} },
    };
    const { ctx, diagnostics } = makeContext(file, undefined, tmpDir);
    refHookScriptExists.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });
});
