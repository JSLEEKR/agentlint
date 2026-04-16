/**
 * Reference rules — validate that referenced files, tools, and models exist.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  Rule,
  RuleContext,
  MarkdownParsed,
  JsonParsed,
} from "../types.js";
import { KNOWN_MODELS } from "../types.js";

/**
 * ref-file-exists: Referenced file paths must exist on disk.
 */
export const refFileExists: Rule = {
  meta: {
    id: "ref-file-exists",
    description: "Referenced file paths must exist on disk",
    category: "ref",
    defaultSeverity: "warning",
    fixable: false,
    appliesTo: ["claude-md", "agents-md", "soul-md", "cursorrules", "generic-md"],
  },
  check(ctx: RuleContext) {
    const { file, projectRoot } = ctx;
    if (!file.parsed || file.parsed.kind !== "markdown") return;

    const md = file.parsed as MarkdownParsed;

    for (const ref of md.references) {
      // Skip URLs
      if (ref.path.startsWith("http://") || ref.path.startsWith("https://")) continue;
      // Skip template/variable patterns
      if (ref.path.includes("${") || ref.path.includes("{{")) continue;
      // Skip wildcard patterns
      if (ref.path.includes("*")) continue;

      const resolvedPath = path.resolve(
        path.dirname(path.resolve(projectRoot, file.path)),
        ref.path
      );

      if (!fs.existsSync(resolvedPath)) {
        ctx.report({
          severity: "warning",
          message: `Referenced file does not exist: ${ref.path}`,
          file: file.path,
          line: ref.line,
          column: ref.column,
        });
      }
    }
  },
};

/**
 * ref-tool-registered: Tool names used in docs must have a registration in MCP config.
 */
export const refToolRegistered: Rule = {
  meta: {
    id: "ref-tool-registered",
    description: "Tool names referenced in docs must be registered in MCP config",
    category: "ref",
    defaultSeverity: "warning",
    fixable: false,
    appliesTo: ["claude-md", "agents-md"],
  },
  check(ctx: RuleContext) {
    const { file, allFiles } = ctx;
    if (!file.parsed || file.parsed.kind !== "markdown") return;

    // Collect registered tool/server names from MCP configs
    const registeredTools = new Set<string>();
    for (const f of allFiles) {
      if (f.type !== "mcp-json" && f.type !== "claude-json") continue;
      if (!f.parsed || f.parsed.kind !== "json") continue;

      const json = f.parsed as JsonParsed;
      const data = json.data as Record<string, unknown>;
      extractMcpServerNames(data, registeredTools);
    }

    // If no MCP configs found, skip this rule
    if (registeredTools.size === 0) return;

    const md = file.parsed as MarkdownParsed;

    // Look for tool references like `mcp__servername__toolname` or `use_mcp_tool(server, tool)`
    const toolRefPattern = /mcp__(\w+)__(\w+)/g;
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];
      toolRefPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = toolRefPattern.exec(line)) !== null) {
        const serverName = match[1];
        if (!registeredTools.has(serverName)) {
          ctx.report({
            severity: "warning",
            message: `MCP server "${serverName}" referenced but not found in any MCP config file`,
            file: file.path,
            line: i + 1,
            column: match.index + 1,
          });
        }
      }
    }

    // Also check for explicit tool mentions in headings/lists referencing "tool:" or "server:"
    void md; // md used above via file.lines iteration
  },
};

function extractMcpServerNames(
  data: Record<string, unknown>,
  names: Set<string>
): void {
  // Handle .mcp.json format: { "mcpServers": { "name": { ... } } }
  if (data.mcpServers && typeof data.mcpServers === "object") {
    for (const key of Object.keys(data.mcpServers as Record<string, unknown>)) {
      names.add(key);
    }
  }
  // Handle claude_desktop_config.json format
  if (data.servers && typeof data.servers === "object") {
    for (const key of Object.keys(data.servers as Record<string, unknown>)) {
      names.add(key);
    }
  }
  // Handle direct server definitions
  if (data.name && typeof data.name === "string") {
    names.add(data.name);
  }
}

/**
 * ref-model-valid: Model names must be known valid models.
 */
export const refModelValid: Rule = {
  meta: {
    id: "ref-model-valid",
    description: "Model names referenced in configs must be known valid models",
    category: "ref",
    defaultSeverity: "warning",
    fixable: false,
    appliesTo: ["claude-md", "agents-md", "claude-json", "settings-json", "mcp-json"],
  },
  check(ctx: RuleContext) {
    const { file } = ctx;

    // Pattern to find model name references
    const modelPattern = /\b(claude-[a-z0-9.-]+|gpt-[a-z0-9.-]+|o[134]-(?:mini|preview)|gemini-[a-z0-9.-]+)\b/g;

    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];
      modelPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = modelPattern.exec(line)) !== null) {
        const modelName = match[1];
        if (!KNOWN_MODELS.has(modelName)) {
          // Check if it looks like a model name that could be a typo
          const closest = findClosestModel(modelName);
          const suggestion = closest ? ` Did you mean "${closest}"?` : "";
          ctx.report({
            severity: "warning",
            message: `Unknown model name "${modelName}".${suggestion}`,
            file: file.path,
            line: i + 1,
            column: match.index + 1,
          });
        }
      }
    }
  },
};

function findClosestModel(input: string): string | null {
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const model of KNOWN_MODELS) {
    const dist = levenshtein(input, model);
    if (dist < bestDistance && dist <= 3) {
      bestDistance = dist;
      bestMatch = model;
    }
  }

  return bestMatch;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }

  return dp[m][n];
}

/**
 * ref-hook-script-exists: Hook config references scripts that must exist.
 */
export const refHookScriptExists: Rule = {
  meta: {
    id: "ref-hook-script-exists",
    description: "Hook configuration must reference existing script files",
    category: "ref",
    defaultSeverity: "error",
    fixable: false,
    appliesTo: ["settings-json", "claude-json"],
  },
  check(ctx: RuleContext) {
    const { file, projectRoot } = ctx;
    if (!file.parsed || file.parsed.kind !== "json") return;

    const json = file.parsed as JsonParsed;
    const data = json.data as Record<string, unknown>;

    // Check hooks in settings.json format
    const hooks = data.hooks as Record<string, unknown> | undefined;
    if (!hooks || typeof hooks !== "object") return;

    for (const [hookName, hookDef] of Object.entries(hooks)) {
      if (!hookDef || typeof hookDef !== "object") continue;

      const hookEntries = Array.isArray(hookDef) ? hookDef : [hookDef];

      for (const entry of hookEntries) {
        if (typeof entry !== "object" || entry === null) continue;
        const command = (entry as Record<string, unknown>).command;
        if (typeof command !== "string") continue;

        // Extract the script path from the command
        const scriptPath = extractScriptPath(command);
        if (!scriptPath) continue;

        const resolved = path.resolve(projectRoot, scriptPath);
        if (!fs.existsSync(resolved)) {
          const line = findKeyLineInContent(file.lines, hookName);
          ctx.report({
            severity: "error",
            message: `Hook "${hookName}" references non-existent script: ${scriptPath}`,
            file: file.path,
            line,
            column: 1,
          });
        }
      }
    }
  },
};

function extractScriptPath(command: string): string | null {
  // Match patterns like "node path/to/script.js" or "./script.sh"
  const patterns = [
    /(?:node|tsx|ts-node|python|python3|bash|sh)\s+["']?([^\s"']+)["']?/,
    /^["']?(\.[^\s"']+)["']?/,
  ];

  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function findKeyLineInContent(lines: string[], key: string): number {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`"${escaped}"`);
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) return i + 1;
  }
  return 1;
}

export const refRules: Rule[] = [
  refFileExists,
  refToolRegistered,
  refModelValid,
  refHookScriptExists,
];
