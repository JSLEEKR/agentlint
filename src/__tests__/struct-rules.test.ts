/**
 * Tests for structural rules.
 */

import { describe, it, expect } from "vitest";
import type { RuleContext, ParsedFile, LintDiagnostic, MarkdownParsed } from "../types.js";
import { getDefaultConfig } from "../config.js";
import {
  structClaudeMdSections,
  structFrontmatterValid,
  structJsonValid,
  structNoDuplicateAgents,
} from "../rules/struct-rules.js";
import { parseMarkdown } from "../parsers/markdown.js";

function makeContext(file: ParsedFile, allFiles?: ParsedFile[]): {
  ctx: RuleContext;
  diagnostics: LintDiagnostic[];
} {
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
        category: "struct",
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

describe("struct-claude-md-sections", () => {
  it("should warn on CLAUDE.md with no headings", () => {
    const file = makeMdFile("Just some text without any headings.\n");
    const { ctx, diagnostics } = makeContext(file);
    structClaudeMdSections.check(ctx);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("no headings");
  });

  it("should warn on CLAUDE.md with no h2 headings", () => {
    const file = makeMdFile("# Title Only\nSome content\n### Sub\n");
    const { ctx, diagnostics } = makeContext(file);
    structClaudeMdSections.check(ctx);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("no ## (h2) headings");
  });

  it("should pass on well-structured CLAUDE.md", () => {
    const file = makeMdFile("# Title\n## Section 1\nContent\n## Section 2\nMore\n");
    const { ctx, diagnostics } = makeContext(file);
    structClaudeMdSections.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should warn on very long sections", () => {
    const longSection = "## Section\n" + "Line\n".repeat(110) + "## Next\n";
    const file = makeMdFile(longSection);
    const { ctx, diagnostics } = makeContext(file);
    structClaudeMdSections.check(ctx);
    const longSectionWarnings = diagnostics.filter((d) => d.message.includes("lines long"));
    expect(longSectionWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("should not fire on non-claude-md files", () => {
    const file = makeMdFile("No headings here.\n", "agents-md");
    file.type = "agents-md";
    const { ctx, diagnostics } = makeContext(file);
    structClaudeMdSections.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should handle empty file", () => {
    const file = makeMdFile("");
    const { ctx, diagnostics } = makeContext(file);
    structClaudeMdSections.check(ctx);
    expect(diagnostics).toHaveLength(1);
  });
});

describe("struct-frontmatter-valid", () => {
  it("should pass on valid frontmatter", () => {
    const file = makeMdFile("---\ntitle: Test\n---\n# Content\n");
    const { ctx, diagnostics } = makeContext(file);
    structFrontmatterValid.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should error on invalid YAML frontmatter", () => {
    const content = "---\ntitle: [\n  bad yaml\n---\n# Content\n";
    const file = makeMdFile(content);
    // Manually set frontmatterRaw since the parser tries to find it
    const md = file.parsed as MarkdownParsed;
    md.frontmatterRaw = "title: [\n  bad yaml";
    md.frontmatterStartLine = 1;
    md.frontmatterEndLine = 4;
    const { ctx, diagnostics } = makeContext(file);
    structFrontmatterValid.check(ctx);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("Invalid YAML frontmatter");
  });

  it("should pass when no frontmatter present", () => {
    const file = makeMdFile("# Just a heading\nContent\n");
    const { ctx, diagnostics } = makeContext(file);
    structFrontmatterValid.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should store parsed frontmatter for other rules", () => {
    const file = makeMdFile("---\ntitle: Test\n---\n# Content\n");
    const { ctx } = makeContext(file);
    structFrontmatterValid.check(ctx);
    const md = file.parsed as MarkdownParsed;
    expect(md.frontmatter?.title).toBe("Test");
  });
});

describe("struct-json-valid", () => {
  it("should error on files with parse errors", () => {
    const file: ParsedFile = {
      path: ".mcp.json",
      type: "mcp-json",
      content: "{invalid}",
      lines: ["{invalid}"],
      parseError: "Unexpected token",
    };
    const { ctx, diagnostics } = makeContext(file);
    structJsonValid.check(ctx);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("Invalid JSON");
  });

  it("should pass on valid JSON", () => {
    const file: ParsedFile = {
      path: ".mcp.json",
      type: "mcp-json",
      content: "{}",
      lines: ["{}"],
      parsed: { kind: "json", data: {} },
    };
    const { ctx, diagnostics } = makeContext(file);
    structJsonValid.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should pass when no parse error", () => {
    const file: ParsedFile = {
      path: "settings.json",
      type: "settings-json",
      content: '{"key":"value"}',
      lines: ['{"key":"value"}'],
      parsed: { kind: "json", data: { key: "value" } },
    };
    const { ctx, diagnostics } = makeContext(file);
    structJsonValid.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });
});

describe("struct-no-duplicate-agents", () => {
  it("should error on duplicate agent names", () => {
    const file = makeMdFile("## Builder\nDoes building\n## Evaluator\nDoes eval\n## Builder\nDuplicate\n", "agents-md");
    const { ctx, diagnostics } = makeContext(file);
    structNoDuplicateAgents.check(ctx);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("Duplicate agent name");
    expect(diagnostics[0].message).toContain("Builder");
  });

  it("should pass with unique agent names", () => {
    const file = makeMdFile("## Builder\nDoes building\n## Evaluator\nDoes eval\n## Reviewer\nDoes review\n", "agents-md");
    const { ctx, diagnostics } = makeContext(file);
    structNoDuplicateAgents.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should detect case-insensitive duplicates", () => {
    const file = makeMdFile("## Builder\nContent\n## builder\nSame name\n", "agents-md");
    const { ctx, diagnostics } = makeContext(file);
    structNoDuplicateAgents.check(ctx);
    expect(diagnostics).toHaveLength(1);
  });

  it("should not fire on non-agents-md", () => {
    const file = makeMdFile("## Builder\n## Builder\n");
    file.type = "claude-md";
    const { ctx, diagnostics } = makeContext(file);
    structNoDuplicateAgents.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should handle empty AGENTS.md", () => {
    const file = makeMdFile("", "agents-md");
    const { ctx, diagnostics } = makeContext(file);
    structNoDuplicateAgents.check(ctx);
    expect(diagnostics).toHaveLength(0);
  });

  it("should check both h2 and h3 levels", () => {
    const file = makeMdFile("### Worker\nContent\n### Worker\nDuplicate\n", "agents-md");
    const { ctx, diagnostics } = makeContext(file);
    structNoDuplicateAgents.check(ctx);
    expect(diagnostics).toHaveLength(1);
  });
});
