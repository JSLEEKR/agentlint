/**
 * File scanner — discovers and classifies agent config files in a project directory.
 */

import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { FileType, ParsedFile } from "./types.js";
import { parseMarkdown } from "./parsers/markdown.js";
import { parseJson } from "./parsers/json-parser.js";
import { parseYaml } from "./parsers/yaml-parser.js";

/** Map of glob patterns to file types */
const FILE_PATTERNS: Array<{ pattern: string; type: FileType }> = [
  { pattern: "**/CLAUDE.md", type: "claude-md" },
  { pattern: "**/.claude/CLAUDE.md", type: "claude-md" },
  { pattern: "**/AGENTS.md", type: "agents-md" },
  { pattern: "**/SOUL.md", type: "soul-md" },
  { pattern: "**/.cursorrules", type: "cursorrules" },
  { pattern: "**/.claude.json", type: "claude-json" },
  { pattern: "**/.claude/settings.json", type: "settings-json" },
  { pattern: "**/.claude/settings.local.json", type: "settings-json" },
  { pattern: "**/claude_desktop_config.json", type: "claude-json" },
  { pattern: "**/.mcp.json", type: "mcp-json" },
  { pattern: "**/mcp.json", type: "mcp-json" },
  { pattern: "**/.claude/hooks/*.js", type: "hook-config" },
  { pattern: "**/.claude/hooks/*.sh", type: "hook-config" },
  { pattern: "**/.claude/hooks/*.ts", type: "hook-config" },
  { pattern: "**/.hooks/*.js", type: "hook-config" },
  { pattern: "**/.hooks/*.sh", type: "hook-config" },
];

export interface ScanOptions {
  cwd: string;
  ignore?: string[];
}

/**
 * Scan a directory for agent config files.
 */
export async function scanFiles(options: ScanOptions): Promise<ParsedFile[]> {
  const { cwd, ignore = [] } = options;
  const defaultIgnore = [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.next/**",
    "**/vendor/**",
    "**/target/**",
  ];
  const allIgnore = [...defaultIgnore, ...ignore];

  const files: ParsedFile[] = [];
  const seenPaths = new Set<string>();

  for (const { pattern, type } of FILE_PATTERNS) {
    const matches = await fg(pattern, {
      cwd,
      ignore: allIgnore,
      absolute: false,
      dot: true,
    });

    for (const relPath of matches) {
      // Normalize path separators for consistent output
      const normalizedPath = relPath.replace(/\\/g, "/");
      if (seenPaths.has(normalizedPath)) continue;
      seenPaths.add(normalizedPath);

      const absPath = path.resolve(cwd, relPath);
      try {
        const content = fs.readFileSync(absPath, { encoding: "utf-8" });
        const lines = content.split("\n");
        const parsed = parseFileContent(content, lines, type);
        files.push({
          path: normalizedPath,
          type,
          content,
          lines,
          parsed: parsed.data,
          parseError: parsed.error,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        files.push({
          path: normalizedPath,
          type,
          content: "",
          lines: [],
          parseError: `Failed to read file: ${message}`,
        });
      }
    }
  }

  return files;
}

function parseFileContent(
  content: string,
  lines: string[],
  type: FileType
): { data?: ParsedFile["parsed"]; error?: string } {
  switch (type) {
    case "claude-md":
    case "agents-md":
    case "soul-md":
    case "cursorrules":
    case "generic-md":
      return { data: parseMarkdown(content, lines) };

    case "claude-json":
    case "settings-json":
    case "mcp-json":
    case "generic-json": {
      const result = parseJson(content);
      if (result.error) {
        return { error: result.error };
      }
      return { data: result.parsed };
    }

    case "hook-config":
      // Hook scripts are plain text — no structured parse needed
      return { data: undefined };

    case "generic-yaml": {
      const result = parseYaml(content);
      if (result.error) {
        return { error: result.error };
      }
      return { data: result.parsed };
    }

    default:
      return {};
  }
}

/**
 * Classify a file by its name/path into a FileType.
 */
export function classifyFile(filePath: string): FileType | null {
  const normalized = filePath.replace(/\\/g, "/");
  const basename = path.basename(normalized);
  const dir = path.dirname(normalized);

  if (basename === "CLAUDE.md") return "claude-md";
  if (basename === "AGENTS.md") return "agents-md";
  if (basename === "SOUL.md") return "soul-md";
  if (basename === ".cursorrules") return "cursorrules";
  if (basename === ".claude.json" || basename === "claude_desktop_config.json") return "claude-json";
  if (basename === "settings.json" && dir.endsWith(".claude")) return "settings-json";
  if (basename === "settings.local.json" && dir.endsWith(".claude")) return "settings-json";
  if (basename === ".mcp.json" || basename === "mcp.json") return "mcp-json";
  if ((dir.endsWith(".claude/hooks") || dir.endsWith(".hooks")) &&
      /\.(js|sh|ts)$/.test(basename)) return "hook-config";

  return null;
}
