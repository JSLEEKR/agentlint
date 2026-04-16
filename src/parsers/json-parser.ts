/**
 * JSON parser — parses JSON config files with line-level error reporting.
 */

import type { JsonParsed } from "../types.js";

export interface JsonParseResult {
  parsed?: JsonParsed;
  error?: string;
  errorLine?: number;
  errorColumn?: number;
}

export function parseJson(content: string): JsonParseResult {
  try {
    const data = JSON.parse(content);
    return { parsed: { kind: "json", data } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Try to extract line/column from the error message
    const posMatch = message.match(/position\s+(\d+)/i);
    let errorLine = 1;
    let errorColumn = 1;

    if (posMatch) {
      const position = parseInt(posMatch[1], 10);
      if (!isNaN(position)) {
        // Convert byte position to line/column
        let pos = 0;
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (pos + lines[i].length + 1 > position) {
            errorLine = i + 1;
            errorColumn = position - pos + 1;
            break;
          }
          pos += lines[i].length + 1; // +1 for \n
        }
      }
    }

    return {
      error: message,
      errorLine,
      errorColumn,
    };
  }
}

/**
 * Find the line number where a specific JSON key appears (first occurrence).
 * Returns 1-based line number.
 */
export function findJsonKeyLine(
  lines: string[],
  key: string
): number {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`"${escaped}"\\s*:`);
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Find all occurrences of a JSON key and return their line numbers.
 */
export function findAllJsonKeyLines(
  lines: string[],
  key: string
): number[] {
  const results: number[] = [];
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`"${escaped}"\\s*:`);
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      results.push(i + 1);
    }
  }
  return results;
}
