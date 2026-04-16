/**
 * Markdown parser — extracts frontmatter, headings, code blocks, links, and file references.
 */

import {
  type MarkdownParsed,
  type MarkdownHeading,
  type CodeBlock,
  type MarkdownLink,
  type FileReference,
} from "../types.js";

export function parseMarkdown(content: string, lines: string[]): MarkdownParsed {
  const result: MarkdownParsed = {
    kind: "markdown",
    frontmatterStartLine: 0,
    frontmatterEndLine: 0,
    headings: [],
    codeBlocks: [],
    links: [],
    references: [],
  };

  // Parse frontmatter (--- delimited YAML block at start)
  parseFrontmatter(content, lines, result);

  // Parse headings
  result.headings = parseHeadings(lines);

  // Parse code blocks
  result.codeBlocks = parseCodeBlocks(lines);

  // Parse links
  result.links = parseLinks(lines);

  // Parse file references
  result.references = parseFileReferences(lines);

  return result;
}

function parseFrontmatter(
  _content: string,
  lines: string[],
  result: MarkdownParsed
): void {
  if (lines.length === 0 || lines[0].trim() !== "---") {
    return;
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return;
  }

  result.frontmatterStartLine = 1; // 1-based
  result.frontmatterEndLine = endIndex + 1; // 1-based
  result.frontmatterRaw = lines.slice(1, endIndex).join("\n");
}

function parseHeadings(lines: string[]): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i + 1, // 1-based
      });
    }
  }

  return headings;
}

function parseCodeBlocks(lines: string[]): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let inBlock = false;
  let currentBlock: { language: string; lines: string[]; startLine: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^(`{3,})([\w-]*)$/);

    if (fenceMatch && !inBlock) {
      inBlock = true;
      currentBlock = {
        language: fenceMatch[2] || "",
        lines: [],
        startLine: i + 1, // 1-based
      };
    } else if (line.trim().match(/^`{3,}$/) && inBlock && currentBlock) {
      blocks.push({
        language: currentBlock.language,
        content: currentBlock.lines.join("\n"),
        startLine: currentBlock.startLine,
        endLine: i + 1, // 1-based
      });
      inBlock = false;
      currentBlock = null;
    } else if (inBlock && currentBlock) {
      currentBlock.lines.push(line);
    }
  }

  return blocks;
}

function parseLinks(lines: string[]): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Match [text](url) links
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(line)) !== null) {
      links.push({
        text: match[1],
        url: match[2],
        line: i + 1,
        column: match.index + 1,
      });
    }
  }

  return links;
}

function parseFileReferences(lines: string[]): FileReference[] {
  const refs: FileReference[] = [];
  let inCodeBlock = false;

  // Patterns that look like file paths
  const pathPatterns = [
    // Explicit path references like ./foo/bar.js or ../baz/qux.ts
    /(?:^|\s)(\.\.?\/[\w./-]+)/g,
    // Absolute-looking paths in config contexts
    /(?:["'`])([\w./-]+\.(?:js|ts|py|go|rs|sh|json|yaml|yml|md|toml))\b/g,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    for (const pattern of pathPatterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        const refPath = match[1];
        // Skip URLs
        if (refPath.startsWith("http://") || refPath.startsWith("https://")) continue;
        refs.push({
          path: refPath,
          line: i + 1,
          column: match.index + 1,
          context: line.trim(),
        });
      }
    }
  }

  return refs;
}
