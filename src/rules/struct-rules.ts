/**
 * Structural rules — validate document structure and format correctness.
 */

import type { Rule, RuleContext, MarkdownParsed } from "../types.js";
import { parseFrontmatterYaml } from "../parsers/yaml-parser.js";

/**
 * struct-claude-md-sections: CLAUDE.md should have clear sections (headings).
 */
export const structClaudeMdSections: Rule = {
  meta: {
    id: "struct-claude-md-sections",
    description: "CLAUDE.md should have clear sections with headings",
    category: "struct",
    defaultSeverity: "warning",
    fixable: false,
    appliesTo: ["claude-md"],
  },
  check(ctx: RuleContext) {
    const { file } = ctx;
    if (file.type !== "claude-md") return;
    if (!file.parsed || file.parsed.kind !== "markdown") return;

    const md = file.parsed as MarkdownParsed;

    if (md.headings.length === 0) {
      ctx.report({
        severity: "warning",
        message: "CLAUDE.md has no headings. Use ## sections to organize instructions.",
        file: file.path,
        line: 1,
        column: 1,
      });
      return;
    }

    // Check if there's at least one level-2 heading
    const hasH2 = md.headings.some((h) => h.level === 2);
    if (!hasH2) {
      ctx.report({
        severity: "warning",
        message: "CLAUDE.md has no ## (h2) headings. Use ## to create major sections.",
        file: file.path,
        line: 1,
        column: 1,
      });
    }

    // Check for very long sections (>100 lines without a heading)
    const sortedHeadings = [...md.headings].sort((a, b) => a.line - b.line);
    for (let i = 0; i < sortedHeadings.length; i++) {
      const currentLine = sortedHeadings[i].line;
      const nextLine = i + 1 < sortedHeadings.length
        ? sortedHeadings[i + 1].line
        : file.lines.length;
      const sectionLength = nextLine - currentLine;
      if (sectionLength > 100) {
        ctx.report({
          severity: "info",
          message: `Section "${sortedHeadings[i].text}" is ${sectionLength} lines long. Consider breaking it into subsections.`,
          file: file.path,
          line: currentLine,
          column: 1,
        });
      }
    }
  },
};

/**
 * struct-frontmatter-valid: YAML frontmatter must parse cleanly.
 */
export const structFrontmatterValid: Rule = {
  meta: {
    id: "struct-frontmatter-valid",
    description: "YAML frontmatter must parse without errors",
    category: "struct",
    defaultSeverity: "error",
    fixable: false,
    appliesTo: ["claude-md", "agents-md", "soul-md", "generic-md"],
  },
  check(ctx: RuleContext) {
    const { file } = ctx;
    if (!file.parsed || file.parsed.kind !== "markdown") return;

    const md = file.parsed as MarkdownParsed;
    if (!md.frontmatterRaw) return; // No frontmatter — not an error

    const result = parseFrontmatterYaml(md.frontmatterRaw);
    if ("error" in result) {
      ctx.report({
        severity: "error",
        message: `Invalid YAML frontmatter: ${result.error}`,
        file: file.path,
        line: md.frontmatterStartLine + result.errorLine,
        column: 1,
      });
    } else {
      // Store parsed frontmatter for other rules
      md.frontmatter = result.data;
    }
  },
};

/**
 * struct-json-valid: JSON configs must parse without errors.
 */
export const structJsonValid: Rule = {
  meta: {
    id: "struct-json-valid",
    description: "JSON configuration files must be valid JSON",
    category: "struct",
    defaultSeverity: "error",
    fixable: false,
    appliesTo: ["claude-json", "settings-json", "mcp-json", "generic-json"],
  },
  check(ctx: RuleContext) {
    const { file } = ctx;
    if (file.parseError) {
      ctx.report({
        severity: "error",
        message: `Invalid JSON: ${file.parseError}`,
        file: file.path,
        line: 1,
        column: 1,
      });
    }
  },
};

/**
 * struct-no-duplicate-agents: AGENTS.md must not define same agent name twice.
 */
export const structNoDuplicateAgents: Rule = {
  meta: {
    id: "struct-no-duplicate-agents",
    description: "AGENTS.md must not define the same agent name twice",
    category: "struct",
    defaultSeverity: "error",
    fixable: false,
    appliesTo: ["agents-md"],
  },
  check(ctx: RuleContext) {
    const { file } = ctx;
    if (file.type !== "agents-md") return;
    if (!file.parsed || file.parsed.kind !== "markdown") return;

    const md = file.parsed as MarkdownParsed;
    const agentNames = new Map<string, number>();

    // Agent definitions are typically h2 or h3 headings
    for (const heading of md.headings) {
      if (heading.level === 2 || heading.level === 3) {
        const name = heading.text.toLowerCase().trim();
        if (agentNames.has(name)) {
          ctx.report({
            severity: "error",
            message: `Duplicate agent name "${heading.text}" (first defined at line ${agentNames.get(name)})`,
            file: file.path,
            line: heading.line,
            column: 1,
          });
        } else {
          agentNames.set(name, heading.line);
        }
      }
    }
  },
};

export const structRules: Rule[] = [
  structClaudeMdSections,
  structFrontmatterValid,
  structJsonValid,
  structNoDuplicateAgents,
];
