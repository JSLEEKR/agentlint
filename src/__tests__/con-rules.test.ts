/**
 * Tests for consistency rules.
 */

import { describe, it, expect } from "vitest";
import type { RuleContext, ParsedFile, LintDiagnostic } from "../types.js";
import { getDefaultConfig } from "../config.js";
import {
  conClaudeMcpSync,
  conAgentsToolsSync,
  conSettingsHooksSync,
  conNoConflictingRules,
} from "../rules/con-rules.js";
import { parseMarkdown } from "../parsers/markdown.js";

function makeContext(
  file: ParsedFile,
  allFiles?: ParsedFile[]
): { ctx: RuleContext; diagnostics: LintDiagnostic[] } {
  const diagnostics: LintDiagnostic[] = [];
  const ctx: RuleContext = {
    file,
    allFiles: allFiles ?? [file],
    projectRoot: "/test",
    config: getDefaultConfig(),
    report(diag) {
      diagnostics.push({
        ...diag,
        ruleId: "test",
        category: "con",
        severity: diag.severity ?? "warning",
      });
    },
  };
  return { ctx, diagnostics };
}

function makeMdFile(
  content: string,
  type: "claude-md" | "agents-md" | "cursorrules" = "claude-md"
): ParsedFile {
  const lines = content.split("\n");
  return {
    path: type === "claude-md" ? "CLAUDE.md" : type === "agents-md" ? "AGENTS.md" : ".cursorrules",
    type,
    content,
    lines,
    parsed: parseMarkdown(content, lines),
  };
}

describe("con-claude-mcp-sync", () => {
  it("should warn when CLAUDE.md references unregistered MCP server", () => {
    const claudeFile = makeMdFile("Use mcp__ghost_server__do_thing for work\n");
    const mcpFile: ParsedFile = {
      path: ".mcp.json",
      type: "mcp-json",
      content: '{"mcpServers":{"real_server":{}}}',
      lines: ['{"mcpServers":{"real_server":{}}}'],
      parsed: { kind: "json", data: { mcpServers: { real_server: {} } } },
    };
    const { ctx, diagnostics } = makeContext(claudeFile, [claudeFile, mcpFile]);
    conClaudeMcpSync.check(ctx);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("ghost_server");
  });

  it("should pass when CLAUDE.md references registered server", () => {
    const claudeFile = makeMdFile("Use mcp__real_server__do_thing for work\n");
    const mcpFile: ParsedFile = {
      path: ".mcp.json",
      type: "mcp-json",
      content: '{"mcpServers":{"real_server":{}}}',
      lines: ['{"mcpServers":{"real_server":{}}}'],
      parsed: { kind: "json", data: { mcpServers: { real_server: {} } } },
    };
    const { ctx, diagnostics } = makeContext(claudeFile, [claudeFile, mcpFile]);
    conClaudeMcpSync.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should skip when no MCP configs present", () => {
    const claudeFile = makeMdFile("Use mcp__server__tool\n");
    const { ctx, diagnostics } = makeContext(claudeFile);
    conClaudeMcpSync.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should not fire on non-claude-md files", () => {
    const file = makeMdFile("Use mcp__server__tool\n", "agents-md");
    const { ctx, diagnostics } = makeContext(file);
    conClaudeMcpSync.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should check against multiple MCP config files", () => {
    const claudeFile = makeMdFile("Use mcp__server_a__tool and mcp__server_b__tool\n");
    const mcp1: ParsedFile = {
      path: ".mcp.json",
      type: "mcp-json",
      content: '{"mcpServers":{"server_a":{}}}',
      lines: ['{"mcpServers":{"server_a":{}}}'],
      parsed: { kind: "json", data: { mcpServers: { server_a: {} } } },
    };
    const mcp2: ParsedFile = {
      path: ".claude.json",
      type: "claude-json",
      content: '{"mcpServers":{"server_b":{}}}',
      lines: ['{"mcpServers":{"server_b":{}}}'],
      parsed: { kind: "json", data: { mcpServers: { server_b: {} } } },
    };
    const { ctx, diagnostics } = makeContext(claudeFile, [claudeFile, mcp1, mcp2]);
    conClaudeMcpSync.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });
});

describe("con-agents-tools-sync", () => {
  it("should warn when AGENTS.md references unregistered server", () => {
    const agentsFile = makeMdFile("## Builder\nUse mcp__missing__tool\n", "agents-md");
    const mcpFile: ParsedFile = {
      path: ".mcp.json",
      type: "mcp-json",
      content: '{"mcpServers":{"existing":{}}}',
      lines: ['{"mcpServers":{"existing":{}}}'],
      parsed: { kind: "json", data: { mcpServers: { existing: {} } } },
    };
    const { ctx, diagnostics } = makeContext(agentsFile, [agentsFile, mcpFile]);
    conAgentsToolsSync.check(ctx);
    expect(diagnostics).toHaveLength(1);
  });

  it("should pass when AGENTS.md references registered server", () => {
    const agentsFile = makeMdFile("## Builder\nUse mcp__existing__tool\n", "agents-md");
    const mcpFile: ParsedFile = {
      path: ".mcp.json",
      type: "mcp-json",
      content: '{"mcpServers":{"existing":{}}}',
      lines: ['{"mcpServers":{"existing":{}}}'],
      parsed: { kind: "json", data: { mcpServers: { existing: {} } } },
    };
    const { ctx, diagnostics } = makeContext(agentsFile, [agentsFile, mcpFile]);
    conAgentsToolsSync.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should not fire on non-agents-md", () => {
    const file = makeMdFile("mcp__server__tool\n");
    const { ctx, diagnostics } = makeContext(file);
    conAgentsToolsSync.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });
});

describe("con-settings-hooks-sync", () => {
  it("should warn when hook uses denied tool", () => {
    const file: ParsedFile = {
      path: ".claude/settings.json",
      type: "settings-json",
      content: '{}',
      lines: ['{"permissions":{"deny":["rm"]},"hooks":{"pre":[{"command":"rm temp"}]}}'],
      parsed: {
        kind: "json",
        data: {
          permissions: { deny: ["rm"] },
          hooks: { pre: [{ command: "rm temp" }] },
        },
      },
    };
    const { ctx, diagnostics } = makeContext(file);
    conSettingsHooksSync.check(ctx);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("deny list");
  });

  it("should detect permission conflicts between settings files", () => {
    const content1 = '{"permissions":{"deny":["Bash"]}}';
    const content2 = '{"permissions":{"allow":["Bash"]}}';
    const file1: ParsedFile = {
      path: ".claude/settings.json",
      type: "settings-json",
      content: content1,
      lines: content1.split("\n"),
      parsed: {
        kind: "json",
        data: { permissions: { deny: ["Bash"] }, hooks: {} },
      },
    };
    const file2: ParsedFile = {
      path: ".claude/settings.local.json",
      type: "settings-json",
      content: content2,
      lines: content2.split("\n"),
      parsed: {
        kind: "json",
        data: { permissions: { allow: ["Bash"] } },
      },
    };
    const { ctx, diagnostics } = makeContext(file1, [file1, file2]);
    conSettingsHooksSync.check(ctx);
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain("Permission conflict");
  });

  it("should pass when no conflicts", () => {
    const file: ParsedFile = {
      path: ".claude/settings.json",
      type: "settings-json",
      content: '{}',
      lines: ['{}'],
      parsed: {
        kind: "json",
        data: {
          permissions: { deny: ["dangerous"] },
          hooks: { pre: [{ command: "node lint.js" }] },
        },
      },
    };
    const { ctx, diagnostics } = makeContext(file);
    conSettingsHooksSync.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should skip when no hooks or permissions", () => {
    const file: ParsedFile = {
      path: ".claude/settings.json",
      type: "settings-json",
      content: '{}',
      lines: ['{}'],
      parsed: { kind: "json", data: {} },
    };
    const { ctx, diagnostics } = makeContext(file);
    conSettingsHooksSync.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });
});

describe("con-no-conflicting-rules", () => {
  it("should detect conflicting style preferences", () => {
    const cursorFile = makeMdFile("use tabs\n", "cursorrules");
    const claudeFile = makeMdFile("use spaces\n");
    const { ctx, diagnostics } = makeContext(cursorFile, [cursorFile, claudeFile]);
    conNoConflictingRules.check(ctx);
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain("conflict");
  });

  it("should pass when no conflicts", () => {
    const cursorFile = makeMdFile("use typescript\nprefer async/await\n", "cursorrules");
    const claudeFile = makeMdFile("## Guidelines\nUse typescript for all code\n");
    const { ctx, diagnostics } = makeContext(cursorFile, [cursorFile, claudeFile]);
    conNoConflictingRules.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should skip when no CLAUDE.md exists", () => {
    const cursorFile = makeMdFile("use tabs\n", "cursorrules");
    const { ctx, diagnostics } = makeContext(cursorFile);
    conNoConflictingRules.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should not fire on non-cursorrules", () => {
    const file = makeMdFile("use tabs\nuse spaces\n");
    const { ctx, diagnostics } = makeContext(file);
    conNoConflictingRules.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should detect quote style conflicts", () => {
    const cursorFile = makeMdFile("use single quotes\n", "cursorrules");
    const claudeFile = makeMdFile("use double quotes\n");
    const { ctx, diagnostics } = makeContext(cursorFile, [cursorFile, claudeFile]);
    conNoConflictingRules.check(ctx);
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
  });
});
