/**
 * Style rules — enforce formatting and style conventions.
 */

import type { Rule, RuleContext, MarkdownParsed, LintFix } from "../types.js";

/**
 * style-md-heading-hierarchy: Headings should follow h1 > h2 > h3 order.
 */
export const styleMdHeadingHierarchy: Rule = {
  meta: {
    id: "style-md-heading-hierarchy",
    description: "Markdown headings should follow a proper hierarchy (h1 > h2 > h3)",
    category: "style",
    defaultSeverity: "warning",
    fixable: false,
    appliesTo: ["claude-md", "agents-md", "soul-md", "cursorrules", "generic-md"],
  },
  check(ctx: RuleContext) {
    const { file } = ctx;
    if (!file.parsed || file.parsed.kind !== "markdown") return;

    const md = file.parsed as MarkdownParsed;
    if (md.headings.length === 0) return;

    let lastLevel = 0;
    for (const heading of md.headings) {
      // Detect skipped levels (e.g., h1 -> h3 without h2)
      if (heading.level > lastLevel + 1 && lastLevel > 0) {
        ctx.report({
          severity: "warning",
          message: `Heading level skips from h${lastLevel} to h${heading.level}. Use h${lastLevel + 1} instead.`,
          file: file.path,
          line: heading.line,
          column: 1,
        });
      }
      lastLevel = heading.level;
    }

    // Check for multiple h1 headings (usually only one is expected)
    const h1s = md.headings.filter((h) => h.level === 1);
    if (h1s.length > 1) {
      for (let i = 1; i < h1s.length; i++) {
        ctx.report({
          severity: "info",
          message: `Multiple h1 headings found. Consider using h2 for "${h1s[i].text}".`,
          file: file.path,
          line: h1s[i].line,
          column: 1,
        });
      }
    }
  },
};

/**
 * style-no-trailing-whitespace: No trailing whitespace (auto-fixable).
 */
export const styleNoTrailingWhitespace: Rule = {
  meta: {
    id: "style-no-trailing-whitespace",
    description: "Lines should not have trailing whitespace",
    category: "style",
    defaultSeverity: "warning",
    fixable: true,
    appliesTo: [
      "claude-md", "agents-md", "soul-md", "cursorrules",
      "claude-json", "settings-json", "mcp-json", "hook-config",
    ],
  },
  check(ctx: RuleContext) {
    const { file } = ctx;

    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];
      const trimmed = line.trimEnd();

      if (trimmed.length < line.length) {
        const fix: LintFix = {
          range: {
            startLine: i + 1,
            startColumn: trimmed.length + 1,
            endLine: i + 1,
            endColumn: line.length + 1,
          },
          text: "",
          description: "Remove trailing whitespace",
        };

        ctx.report({
          severity: "warning",
          message: "Trailing whitespace detected",
          file: file.path,
          line: i + 1,
          column: trimmed.length + 1,
          fix,
        });
      }
    }
  },
};

/**
 * style-consistent-naming: Consistent naming conventions across config files.
 */
export const styleConsistentNaming: Rule = {
  meta: {
    id: "style-consistent-naming",
    description: "Use consistent naming conventions across configuration files",
    category: "style",
    defaultSeverity: "info",
    fixable: false,
    appliesTo: ["claude-md", "agents-md", "settings-json", "mcp-json"],
  },
  check(ctx: RuleContext) {
    const { file } = ctx;

    if (file.parsed?.kind === "json") {
      // Check for inconsistent key naming (camelCase vs snake_case)
      const keys = extractJsonKeys(file.parsed.data as Record<string, unknown>);
      const camelKeys = keys.filter((k) => /[a-z][A-Z]/.test(k.name));
      const snakeKeys = keys.filter((k) => k.name.includes("_") && !/[A-Z]/.test(k.name));

      if (camelKeys.length > 0 && snakeKeys.length > 0) {
        // Mixed naming — report the minority convention
        const minority = camelKeys.length < snakeKeys.length ? camelKeys : snakeKeys;
        const majorityStyle = camelKeys.length >= snakeKeys.length ? "camelCase" : "snake_case";

        for (const key of minority) {
          ctx.report({
            severity: "info",
            message: `Key "${key.name}" uses different naming convention than majority (${majorityStyle})`,
            file: file.path,
            line: key.line,
            column: 1,
          });
        }
      }
    }
  },
};

interface JsonKey {
  name: string;
  line: number;
}

function extractJsonKeys(
  data: Record<string, unknown>,
  lines?: string[],
  depth: number = 0
): JsonKey[] {
  if (depth > 5) return [];
  const keys: JsonKey[] = [];

  for (const [key, value] of Object.entries(data)) {
    keys.push({ name: key, line: 1 }); // Line approximation

    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...extractJsonKeys(value as Record<string, unknown>, lines, depth + 1));
    }
  }

  return keys;
}

/**
 * style-line-length: Lines shouldn't exceed configurable max (default 120).
 */
export const styleLineLength: Rule = {
  meta: {
    id: "style-line-length",
    description: "Lines should not exceed the configured maximum length",
    category: "style",
    defaultSeverity: "warning",
    fixable: false,
    appliesTo: [
      "claude-md", "agents-md", "soul-md", "cursorrules",
      "hook-config",
    ],
  },
  check(ctx: RuleContext) {
    const { file, config } = ctx;

    const settings = config.settings?.["style-line-length"] as
      | { maxLength?: number }
      | undefined;
    const maxLength = settings?.maxLength ?? 120;

    let inCodeBlock = false;

    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];

      // Track code blocks — don't flag lines inside code blocks
      if (line.trim().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      // Skip lines that are just URLs (can't reasonably shorten)
      if (/^\s*https?:\/\/\S+\s*$/.test(line)) continue;
      // Skip lines with markdown links that exceed because of the URL
      if (/\[.+\]\(https?:\/\/\S+\)/.test(line) && line.trim().startsWith("[")) continue;
      // Skip table rows
      if (line.trim().startsWith("|")) continue;

      if (line.length > maxLength) {
        ctx.report({
          severity: "warning",
          message: `Line length ${line.length} exceeds maximum ${maxLength}`,
          file: file.path,
          line: i + 1,
          column: maxLength + 1,
        });
      }
    }
  },
};

export const styleRules: Rule[] = [
  styleMdHeadingHierarchy,
  styleNoTrailingWhitespace,
  styleConsistentNaming,
  styleLineLength,
];
