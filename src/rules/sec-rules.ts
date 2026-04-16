/**
 * Security rules — detect dangerous patterns, secrets, and permission issues.
 */

import type { Rule, RuleContext, JsonParsed } from "../types.js";
import { DANGEROUS_SHELL_PATTERNS, SECRET_PATTERNS } from "../types.js";

/**
 * sec-no-secrets-in-config: No API keys, tokens, passwords in config files.
 */
export const secNoSecretsInConfig: Rule = {
  meta: {
    id: "sec-no-secrets-in-config",
    description: "Config files must not contain API keys, tokens, or passwords",
    category: "sec",
    defaultSeverity: "error",
    fixable: false,
    appliesTo: [
      "claude-md", "agents-md", "soul-md", "cursorrules",
      "claude-json", "settings-json", "mcp-json", "hook-config",
    ],
  },
  check(ctx: RuleContext) {
    const { file } = ctx;
    let inCodeBlock = false;

    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];

      // Track code blocks in markdown files
      if (line.trim().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
      }

      for (const { pattern, name } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        if (match) {
          // Filter false positives: skip placeholder values
          // But don't filter structurally-identifiable tokens (AKIA*, ghp_*, sk-ant-*, etc.)
          const value = match[0];
          const isStructuralToken = /^(?:AKIA|ghp_|gho_|github_pat_|sk-ant-|xoxb-|xoxp-|-----BEGIN)/.test(value);
          // Skip example lines only for non-structural tokens — structural tokens
          // (real AWS keys, GitHub PATs, etc.) must ALWAYS be flagged even on example lines.
          if (!isStructuralToken && (isExampleLine(line) || isPlaceholder(value))) continue;

          ctx.report({
            severity: "error",
            message: `Potential ${name} detected. Never store secrets in config files.`,
            file: file.path,
            line: i + 1,
            column: match.index + 1,
          });
        }
      }
    }
  },
};

function isExampleLine(line: string): boolean {
  const lower = line.toLowerCase();
  // Only skip lines that are clearly documentation examples
  // Check for common documentation markers — but NOT substrings that
  // could appear inside credentials (e.g. AKIA...EXAMPLE is a real AWS key)
  return (
    lower.includes("# example") ||
    lower.includes("for example") ||
    lower.includes("placeholder") ||
    lower.includes("your_") ||
    lower.includes("<your-") ||
    lower.includes("${")
  );
}

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("your_") ||
    lower.includes("xxx") ||
    lower.includes("placeholder") ||
    lower.includes("example") ||
    lower.includes("<token>") ||
    lower.includes("${") ||
    lower.includes("{{")
  );
}

/**
 * sec-no-dangerous-hooks: Hooks should not contain dangerous shell commands.
 */
export const secNoDangerousHooks: Rule = {
  meta: {
    id: "sec-no-dangerous-hooks",
    description: "Hook scripts must not contain dangerous shell commands",
    category: "sec",
    defaultSeverity: "error",
    fixable: false,
    appliesTo: ["hook-config", "settings-json", "claude-json"],
  },
  check(ctx: RuleContext) {
    const { file } = ctx;

    if (file.type === "hook-config") {
      // Check hook script content directly
      checkContentForDangerousPatterns(ctx, file.lines, file.path);
    } else if (file.type === "settings-json" || file.type === "claude-json") {
      // Check hook commands in JSON config
      if (!file.parsed || file.parsed.kind !== "json") return;
      const json = file.parsed as JsonParsed;
      const data = json.data as Record<string, unknown>;
      checkJsonHooksForDangerousPatterns(ctx, data, file.lines, file.path);
    }
  },
};

function checkContentForDangerousPatterns(
  ctx: RuleContext,
  lines: string[],
  filePath: string
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    if (line.trim().startsWith("#") || line.trim().startsWith("//")) continue;

    for (const { pattern, description } of DANGEROUS_SHELL_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        ctx.report({
          severity: "error",
          message: `Dangerous shell pattern: ${description}`,
          file: filePath,
          line: i + 1,
          column: 1,
        });
      }
    }
  }
}

function checkJsonHooksForDangerousPatterns(
  ctx: RuleContext,
  data: Record<string, unknown>,
  lines: string[],
  filePath: string
): void {
  const hooks = data.hooks;
  if (!hooks || typeof hooks !== "object") return;

  for (const [_hookName, hookDef] of Object.entries(hooks as Record<string, unknown>)) {
    if (!hookDef) continue;

    const entries = Array.isArray(hookDef) ? hookDef : [hookDef];
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) continue;
      const command = (entry as Record<string, unknown>).command;
      if (typeof command !== "string") continue;

      for (const { pattern, description } of DANGEROUS_SHELL_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(command)) {
          const line = findCommandLine(lines, command);
          ctx.report({
            severity: "error",
            message: `Dangerous shell pattern in hook command: ${description}`,
            file: filePath,
            line,
            column: 1,
          });
        }
      }
    }
  }
}

function findCommandLine(lines: string[], command: string): number {
  // Use raw substring for literal String.includes() matching — no regex escaping
  const fragment = command.substring(0, Math.min(command.length, 30));
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(fragment)) return i + 1;
  }
  return 1;
}

/**
 * sec-no-broad-permissions: Overly permissive tool access patterns.
 */
export const secNoBroadPermissions: Rule = {
  meta: {
    id: "sec-no-broad-permissions",
    description: "Avoid overly broad tool permission patterns",
    category: "sec",
    defaultSeverity: "warning",
    fixable: false,
    appliesTo: ["settings-json", "claude-json", "claude-md"],
  },
  check(ctx: RuleContext) {
    const { file } = ctx;

    if (file.type === "settings-json" || file.type === "claude-json") {
      if (!file.parsed || file.parsed.kind !== "json") return;
      const json = file.parsed as JsonParsed;
      const data = json.data as Record<string, unknown>;
      checkBroadPermissionsJson(ctx, data, file.lines, file.path);
    }

    // Check for broad permission declarations in markdown
    if (file.type === "claude-md") {
      checkBroadPermissionsMd(ctx, file.lines, file.path);
    }
  },
};

function checkBroadPermissionsJson(
  ctx: RuleContext,
  data: Record<string, unknown>,
  lines: string[],
  filePath: string
): void {
  // Check for allow patterns with wildcards
  const permissions = data.permissions as Record<string, unknown> | undefined;
  if (!permissions) return;

  const allow = permissions.allow as string[] | undefined;
  if (!Array.isArray(allow)) return;

  for (const perm of allow) {
    if (typeof perm !== "string") continue;

    if (perm === "*" || perm === "**") {
      const line = findStringLine(lines, perm);
      ctx.report({
        severity: "warning",
        message: "Wildcard permission grants access to ALL tools. Use specific tool names.",
        file: filePath,
        line,
        column: 1,
      });
    }

    // Check for overly broad Bash permission
    if (perm === "Bash" || perm === "bash") {
      const line = findStringLine(lines, perm);
      ctx.report({
        severity: "info",
        message: "Broad 'Bash' permission allows any shell command. Consider restricting to specific commands.",
        file: filePath,
        line,
        column: 1,
      });
    }
  }
}

function checkBroadPermissionsMd(
  ctx: RuleContext,
  lines: string[],
  filePath: string
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (
      (line.includes("allow all") || line.includes("permit all") || line.includes("grant all")) &&
      (line.includes("tool") || line.includes("command") || line.includes("permission"))
    ) {
      ctx.report({
        severity: "warning",
        message: "Broad permission statement detected. Be specific about which tools/commands are allowed.",
        file: filePath,
        line: i + 1,
        column: 1,
      });
    }
  }
}

function findStringLine(lines: string[], value: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`"${value}"`)) return i + 1;
  }
  return 1;
}

/**
 * sec-no-shell-injection: Hook commands should not interpolate unsanitized variables.
 */
export const secNoShellInjection: Rule = {
  meta: {
    id: "sec-no-shell-injection",
    description: "Hook commands should not interpolate unsanitized variables",
    category: "sec",
    defaultSeverity: "error",
    fixable: false,
    appliesTo: ["hook-config", "settings-json"],
  },
  check(ctx: RuleContext) {
    const { file } = ctx;

    if (file.type === "hook-config") {
      checkShellInjection(ctx, file.lines, file.path);
    } else if (file.type === "settings-json") {
      if (!file.parsed || file.parsed.kind !== "json") return;
      const json = file.parsed as JsonParsed;
      const data = json.data as Record<string, unknown>;
      checkJsonShellInjection(ctx, data, file.lines, file.path);
    }
  },
};

function checkShellInjection(
  ctx: RuleContext,
  lines: string[],
  filePath: string
): void {
  // Patterns that suggest unsanitized variable interpolation
  const injectionPatterns = [
    { pattern: /\$\{?\w+\}?\s*[;|&]/, description: "Variable followed by command separator" },
    { pattern: /`[^`]*\$\{?\w+/, description: "Variable in backtick command substitution" },
    { pattern: /\$\(\s*[^)]*\$\{?\w+/, description: "Variable in command substitution" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("#") || line.trim().startsWith("//")) continue;

    for (const { pattern, description } of injectionPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        ctx.report({
          severity: "error",
          message: `Potential shell injection: ${description}. Sanitize variables before use.`,
          file: filePath,
          line: i + 1,
          column: 1,
        });
      }
    }
  }
}

function checkJsonShellInjection(
  ctx: RuleContext,
  data: Record<string, unknown>,
  lines: string[],
  filePath: string
): void {
  const hooks = data.hooks;
  if (!hooks || typeof hooks !== "object") return;

  for (const [_hookName, hookDef] of Object.entries(hooks as Record<string, unknown>)) {
    if (!hookDef) continue;

    const entries = Array.isArray(hookDef) ? hookDef : [hookDef];
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) continue;
      const command = (entry as Record<string, unknown>).command;
      if (typeof command !== "string") continue;

      const injectionPatterns = [
        { pattern: /\$\{?\w+\}?\s*[;|&]/, description: "Variable followed by command separator" },
        { pattern: /`[^`]*\$\{?\w+/, description: "Variable in backtick command substitution" },
      ];

      for (const { pattern, description } of injectionPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(command)) {
          const line = findApproxLine(lines, command);
          ctx.report({
            severity: "error",
            message: `Potential shell injection in hook command: ${description}`,
            file: filePath,
            line,
            column: 1,
          });
        }
      }
    }
  }
}

function findApproxLine(lines: string[], content: string): number {
  const fragment = content.substring(0, Math.min(content.length, 30));
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(fragment)) return i + 1;
  }
  return 1;
}

export const secRules: Rule[] = [
  secNoSecretsInConfig,
  secNoDangerousHooks,
  secNoBroadPermissions,
  secNoShellInjection,
];
