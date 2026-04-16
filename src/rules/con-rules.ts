/**
 * Consistency rules — validate cross-file consistency between agent configs.
 */

import type { Rule, RuleContext, MarkdownParsed, JsonParsed } from "../types.js";

/**
 * con-claude-mcp-sync: Tools mentioned in CLAUDE.md match MCP config.
 */
export const conClaudeMcpSync: Rule = {
  meta: {
    id: "con-claude-mcp-sync",
    description: "Tools mentioned in CLAUDE.md should match MCP config registrations",
    category: "con",
    defaultSeverity: "warning",
    fixable: false,
    appliesTo: ["claude-md"],
  },
  check(ctx: RuleContext) {
    const { file, allFiles } = ctx;
    if (file.type !== "claude-md") return;

    // Gather MCP server names from all config files
    const mcpServers = new Set<string>();
    for (const f of allFiles) {
      if (f.type !== "mcp-json" && f.type !== "claude-json" && f.type !== "settings-json") continue;
      if (!f.parsed || f.parsed.kind !== "json") continue;

      const data = (f.parsed as JsonParsed).data as Record<string, unknown>;
      extractServerNames(data, mcpServers);
    }

    if (mcpServers.size === 0) return;

    // Find MCP tool references in CLAUDE.md
    const mcpRefPattern = /\bmcp__(\w+)__\w+/g;
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];
      mcpRefPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = mcpRefPattern.exec(line)) !== null) {
        const serverName = match[1];
        if (!mcpServers.has(serverName)) {
          ctx.report({
            severity: "warning",
            message: `CLAUDE.md references MCP server "${serverName}" which is not registered in any MCP config file`,
            file: file.path,
            line: i + 1,
            column: match.index + 1,
          });
        }
      }
    }
  },
};

/**
 * con-agents-tools-sync: Agents reference tools that are actually available.
 */
export const conAgentsToolsSync: Rule = {
  meta: {
    id: "con-agents-tools-sync",
    description: "Agent definitions should reference tools that are available",
    category: "con",
    defaultSeverity: "warning",
    fixable: false,
    appliesTo: ["agents-md"],
  },
  check(ctx: RuleContext) {
    const { file, allFiles } = ctx;
    if (file.type !== "agents-md") return;

    // Gather available tool/server names
    const availableTools = new Set<string>();
    for (const f of allFiles) {
      if (f.type !== "mcp-json" && f.type !== "claude-json" && f.type !== "settings-json") continue;
      if (!f.parsed || f.parsed.kind !== "json") continue;

      const data = (f.parsed as JsonParsed).data as Record<string, unknown>;
      extractServerNames(data, availableTools);
    }

    if (availableTools.size === 0) return;

    // Check agent tool references
    const mcpRefPattern = /\bmcp__(\w+)__\w+/g;
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];
      mcpRefPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = mcpRefPattern.exec(line)) !== null) {
        const serverName = match[1];
        if (!availableTools.has(serverName)) {
          ctx.report({
            severity: "warning",
            message: `AGENTS.md references tool from server "${serverName}" which is not registered`,
            file: file.path,
            line: i + 1,
            column: match.index + 1,
          });
        }
      }
    }
  },
};

/**
 * con-settings-hooks-sync: Settings and hooks don't contradict.
 */
export const conSettingsHooksSync: Rule = {
  meta: {
    id: "con-settings-hooks-sync",
    description: "Settings and hook configurations should not contradict each other",
    category: "con",
    defaultSeverity: "warning",
    fixable: false,
    appliesTo: ["settings-json"],
  },
  check(ctx: RuleContext) {
    const { file, allFiles } = ctx;
    if (file.type !== "settings-json") return;
    if (!file.parsed || file.parsed.kind !== "json") return;

    const json = file.parsed as JsonParsed;
    const data = json.data as Record<string, unknown>;

    // Check if hooks reference tools that are denied in permissions
    const permissions = data.permissions as Record<string, unknown> | undefined;
    const hooks = data.hooks as Record<string, unknown> | undefined;

    if (!permissions || !hooks) return;

    const deny = permissions.deny as string[] | undefined;
    if (!Array.isArray(deny) || deny.length === 0) return;

    const denySet = new Set(deny.filter((d): d is string => typeof d === "string"));

    // Check if any hook commands use denied tools
    for (const [hookName, hookDef] of Object.entries(hooks)) {
      if (!hookDef) continue;
      const entries = Array.isArray(hookDef) ? hookDef : [hookDef];

      for (const entry of entries) {
        if (typeof entry !== "object" || entry === null) continue;
        const command = (entry as Record<string, unknown>).command;
        if (typeof command !== "string") continue;

        // Check if the command starts with a denied tool
        for (const denied of denySet) {
          if (command.startsWith(denied) || command.includes(`/${denied}`)) {
            const line = findKeyLine(file.lines, hookName);
            ctx.report({
              severity: "warning",
              message: `Hook "${hookName}" uses "${denied}" which is in the deny list`,
              file: file.path,
              line,
              column: 1,
            });
          }
        }
      }
    }

    // Cross-check with other settings files for conflicts
    for (const f of allFiles) {
      if (f === file) continue;
      if (f.type !== "settings-json") continue;
      if (!f.parsed || f.parsed.kind !== "json") continue;

      const otherData = (f.parsed as JsonParsed).data as Record<string, unknown>;
      const otherPermissions = otherData.permissions as Record<string, unknown> | undefined;
      if (!otherPermissions) continue;

      const otherAllow = otherPermissions.allow as string[] | undefined;
      if (!Array.isArray(otherAllow)) continue;

      // Check for conflicts: one file allows what another denies
      for (const allowed of otherAllow) {
        if (typeof allowed !== "string") continue;
        if (denySet.has(allowed)) {
          ctx.report({
            severity: "warning",
            message: `Permission conflict: "${allowed}" is denied in ${file.path} but allowed in ${f.path}`,
            file: file.path,
            line: findStringInLines(file.lines, allowed),
            column: 1,
          });
        }
      }
    }
  },
};

/**
 * con-no-conflicting-rules: .cursorrules and CLAUDE.md don't conflict.
 */
export const conNoConflictingRules: Rule = {
  meta: {
    id: "con-no-conflicting-rules",
    description: ".cursorrules and CLAUDE.md should not have conflicting instructions",
    category: "con",
    defaultSeverity: "warning",
    fixable: false,
    appliesTo: ["cursorrules"],
  },
  check(ctx: RuleContext) {
    const { file, allFiles } = ctx;
    if (file.type !== "cursorrules") return;

    // Find CLAUDE.md files
    const claudeFiles = allFiles.filter((f) => f.type === "claude-md");
    if (claudeFiles.length === 0) return;

    // Check for explicit contradictions in common areas
    const cursorruleLines = file.lines.map((l) => l.toLowerCase());

    for (const claudeFile of claudeFiles) {
      if (!claudeFile.parsed || claudeFile.parsed.kind !== "markdown") continue;
      const claudeMd = claudeFile.parsed as MarkdownParsed;

      // Check for contradictory language patterns
      const contradictions = findContradictions(cursorruleLines, claudeFile.lines);
      for (const contradiction of contradictions) {
        ctx.report({
          severity: "warning",
          message: `Potential conflict with ${claudeFile.path}: ${contradiction.description}`,
          file: file.path,
          line: contradiction.line,
          column: 1,
        });
      }

      void claudeMd; // used above through claudeFile
    }
  },
};

interface Contradiction {
  line: number;
  description: string;
}

function findContradictions(
  cursorLines: string[],
  claudeLines: string[]
): Contradiction[] {
  const contradictions: Contradiction[] = [];

  // Pattern pairs: if one file says X and another says NOT X
  const conflictPairs = [
    { positive: /\buse\s+typescript\b/, negative: /\bdo\s+not\s+use\s+typescript\b|avoid\s+typescript\b/ },
    { positive: /\buse\s+javascript\b/, negative: /\bdo\s+not\s+use\s+javascript\b|avoid\s+javascript\b/ },
    { positive: /\balways\s+use\s+semicolons\b/, negative: /\bno\s+semicolons\b|never\s+use\s+semicolons\b/ },
    { positive: /\buse\s+tabs\b/, negative: /\buse\s+spaces\b/ },
    { positive: /\buse\s+single\s+quotes\b/, negative: /\buse\s+double\s+quotes\b/ },
  ];

  const claudeLower = claudeLines.map((l) => l.toLowerCase());

  for (let i = 0; i < cursorLines.length; i++) {
    const cursorLine = cursorLines[i];
    for (const { positive, negative } of conflictPairs) {
      if (positive.test(cursorLine)) {
        // Check if CLAUDE.md has the opposite
        for (const cl of claudeLower) {
          if (negative.test(cl)) {
            contradictions.push({
              line: i + 1,
              description: `".cursorrules says '${cursorLine.trim()}' but CLAUDE.md contradicts this"`,
            });
          }
        }
      }
    }
  }

  return contradictions;
}

function extractServerNames(
  data: Record<string, unknown>,
  names: Set<string>
): void {
  if (data.mcpServers && typeof data.mcpServers === "object") {
    for (const key of Object.keys(data.mcpServers as Record<string, unknown>)) {
      names.add(key);
    }
  }
  if (data.servers && typeof data.servers === "object") {
    for (const key of Object.keys(data.servers as Record<string, unknown>)) {
      names.add(key);
    }
  }
}

function findKeyLine(lines: string[], key: string): number {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`"${escaped}"`);
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) return i + 1;
  }
  return 1;
}

function findStringInLines(lines: string[], value: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(value)) return i + 1;
  }
  return 1;
}

export const conRules: Rule[] = [
  conClaudeMcpSync,
  conAgentsToolsSync,
  conSettingsHooksSync,
  conNoConflictingRules,
];
