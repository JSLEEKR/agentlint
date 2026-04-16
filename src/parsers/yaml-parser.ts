/**
 * YAML parser — wraps js-yaml with error normalization.
 */

import yaml from "js-yaml";
import type { YamlParsed } from "../types.js";

export interface YamlParseResult {
  parsed?: YamlParsed;
  error?: string;
  errorLine?: number;
  errorColumn?: number;
}

interface YamlExceptionLike {
  message: string;
  mark?: {
    line?: number;
    column?: number;
  };
}

function isYamlException(err: unknown): err is YamlExceptionLike {
  return (
    err !== null &&
    typeof err === "object" &&
    "mark" in (err as Record<string, unknown>)
  );
}

export function parseYaml(content: string): YamlParseResult {
  try {
    const data = yaml.load(content);
    return { parsed: { kind: "yaml", data } };
  } catch (err: unknown) {
    if (isYamlException(err)) {
      return {
        error: err.message,
        errorLine: err.mark?.line != null ? err.mark.line + 1 : 1,
        errorColumn: err.mark?.column != null ? err.mark.column + 1 : 1,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

/**
 * Parse YAML frontmatter from a raw string (between --- delimiters).
 */
export function parseFrontmatterYaml(
  raw: string
): { data: Record<string, unknown> } | { error: string; errorLine: number } {
  try {
    const data = yaml.load(raw);
    if (data === null || data === undefined) {
      return { data: {} };
    }
    if (typeof data !== "object" || Array.isArray(data)) {
      return { error: "Frontmatter must be a YAML mapping (object)", errorLine: 1 };
    }
    return { data: data as Record<string, unknown> };
  } catch (err: unknown) {
    if (isYamlException(err)) {
      return {
        error: err.message,
        errorLine: err.mark?.line != null ? err.mark.line + 1 : 1,
      };
    }
    return { error: String(err), errorLine: 1 };
  }
}
