/**
 * Tests for parsers: markdown, JSON, YAML.
 */

import { describe, it, expect } from "vitest";
import { parseMarkdown } from "../parsers/markdown.js";
import { parseJson, findJsonKeyLine, findAllJsonKeyLines } from "../parsers/json-parser.js";
import { parseYaml, parseFrontmatterYaml } from "../parsers/yaml-parser.js";

describe("parseMarkdown", () => {
  it("should extract headings", () => {
    const content = "# Title\n## Section\n### Sub\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.headings).toHaveLength(3);
    expect(result.headings[0]).toEqual({ level: 1, text: "Title", line: 1 });
    expect(result.headings[1]).toEqual({ level: 2, text: "Section", line: 2 });
    expect(result.headings[2]).toEqual({ level: 3, text: "Sub", line: 3 });
  });

  it("should not extract headings inside code blocks", () => {
    const content = "## Real\n```\n## Not a heading\n```\n## Also Real\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.headings).toHaveLength(2);
    expect(result.headings[0].text).toBe("Real");
    expect(result.headings[1].text).toBe("Also Real");
  });

  it("should parse frontmatter", () => {
    const content = "---\ntitle: Test\nauthor: Me\n---\n# Hello\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.frontmatterRaw).toBe("title: Test\nauthor: Me");
    expect(result.frontmatterStartLine).toBe(1);
    expect(result.frontmatterEndLine).toBe(4);
  });

  it("should handle missing frontmatter end", () => {
    const content = "---\ntitle: Test\n# No closing\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.frontmatterRaw).toBeUndefined();
  });

  it("should not parse frontmatter if not at the start", () => {
    const content = "Hello\n---\ntitle: Test\n---\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.frontmatterRaw).toBeUndefined();
  });

  it("should extract code blocks", () => {
    const content = "# Title\n```js\nconsole.log('hi');\n```\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.codeBlocks).toHaveLength(1);
    expect(result.codeBlocks[0].language).toBe("js");
    expect(result.codeBlocks[0].content).toBe("console.log('hi');");
    expect(result.codeBlocks[0].startLine).toBe(2);
    expect(result.codeBlocks[0].endLine).toBe(4);
  });

  it("should extract multiple code blocks", () => {
    const content = "```python\nprint('a')\n```\ntext\n```bash\necho hi\n```\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.codeBlocks).toHaveLength(2);
    expect(result.codeBlocks[0].language).toBe("python");
    expect(result.codeBlocks[1].language).toBe("bash");
  });

  it("should extract markdown links", () => {
    const content = "See [docs](./README.md) and [site](https://example.com)\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.links).toHaveLength(2);
    expect(result.links[0]).toMatchObject({ text: "docs", url: "./README.md", line: 1 });
    expect(result.links[1]).toMatchObject({ text: "site", url: "https://example.com", line: 1 });
  });

  it("should not extract links inside code blocks", () => {
    const content = "```\n[not a link](./foo.md)\n```\n[real link](./bar.md)\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].text).toBe("real link");
  });

  it("should extract file references", () => {
    const content = "Use ./config.json for settings\nSee ../docs/guide.md\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.references.length).toBeGreaterThanOrEqual(2);
    const paths = result.references.map((r) => r.path);
    expect(paths).toContain("./config.json");
    expect(paths).toContain("../docs/guide.md");
  });

  it("should not extract URL references", () => {
    const content = "Visit http://example.com\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    const httpRefs = result.references.filter((r) => r.path.startsWith("http"));
    expect(httpRefs).toHaveLength(0);
  });

  it("should handle empty content", () => {
    const result = parseMarkdown("", [""]);
    expect(result.headings).toHaveLength(0);
    expect(result.codeBlocks).toHaveLength(0);
    expect(result.links).toHaveLength(0);
    expect(result.references).toHaveLength(0);
  });

  it("should handle heading with extra whitespace", () => {
    const content = "##   Spaced Title   \n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.headings).toHaveLength(1);
    expect(result.headings[0].text).toBe("Spaced Title");
  });

  it("should handle code blocks without language", () => {
    const content = "```\nplain text\n```\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.codeBlocks).toHaveLength(1);
    expect(result.codeBlocks[0].language).toBe("");
  });

  it("should handle multiple links on same line", () => {
    const content = "[a](1.md) and [b](2.md) and [c](3.md)\n";
    const lines = content.split("\n");
    const result = parseMarkdown(content, lines);
    expect(result.links).toHaveLength(3);
  });
});

describe("parseJson", () => {
  it("should parse valid JSON", () => {
    const result = parseJson('{"key": "value"}');
    expect(result.parsed).toBeDefined();
    expect(result.parsed?.kind).toBe("json");
    expect((result.parsed?.data as Record<string, unknown>).key).toBe("value");
  });

  it("should return error for invalid JSON", () => {
    const result = parseJson("{invalid}");
    expect(result.error).toBeDefined();
    expect(result.parsed).toBeUndefined();
  });

  it("should parse nested JSON", () => {
    const result = parseJson('{"a": {"b": [1, 2, 3]}}');
    expect(result.parsed).toBeDefined();
    const data = result.parsed?.data as Record<string, unknown>;
    expect(data.a).toEqual({ b: [1, 2, 3] });
  });

  it("should handle empty object", () => {
    const result = parseJson("{}");
    expect(result.parsed).toBeDefined();
    expect(result.parsed?.data).toEqual({});
  });

  it("should handle empty array", () => {
    const result = parseJson("[]");
    expect(result.parsed).toBeDefined();
    expect(result.parsed?.data).toEqual([]);
  });

  it("should provide error position info", () => {
    const result = parseJson('{"key": }');
    expect(result.error).toBeDefined();
    expect(result.errorLine).toBeDefined();
  });
});

describe("findJsonKeyLine", () => {
  it("should find key on correct line", () => {
    const lines = ["{", '  "name": "test",', '  "version": "1.0"', "}"];
    expect(findJsonKeyLine(lines, "name")).toBe(2);
    expect(findJsonKeyLine(lines, "version")).toBe(3);
  });

  it("should return 1 for missing key", () => {
    const lines = ["{", '  "name": "test"', "}"];
    expect(findJsonKeyLine(lines, "missing")).toBe(1);
  });

  it("should handle special regex characters in key", () => {
    const lines = ["{", '  "style-line-length": 120', "}"];
    expect(findJsonKeyLine(lines, "style-line-length")).toBe(2);
  });
});

describe("findAllJsonKeyLines", () => {
  it("should find all occurrences", () => {
    const lines = [
      "{",
      '  "name": "a",',
      '  "nested": {',
      '    "name": "b"',
      "  }",
      "}",
    ];
    const result = findAllJsonKeyLines(lines, "name");
    expect(result).toEqual([2, 4]);
  });

  it("should return empty for missing key", () => {
    const lines = ["{", '  "key": "val"', "}"];
    expect(findAllJsonKeyLines(lines, "missing")).toEqual([]);
  });
});

describe("parseYaml", () => {
  it("should parse valid YAML", () => {
    const result = parseYaml("key: value\nlist:\n  - a\n  - b\n");
    expect(result.parsed).toBeDefined();
    expect(result.parsed?.kind).toBe("yaml");
    const data = result.parsed?.data as Record<string, unknown>;
    expect(data.key).toBe("value");
    expect(data.list).toEqual(["a", "b"]);
  });

  it("should return error for invalid YAML", () => {
    const result = parseYaml("key: [\n  invalid: yaml\n");
    expect(result.error).toBeDefined();
  });

  it("should handle empty content", () => {
    const result = parseYaml("");
    expect(result.parsed).toBeDefined();
    // yaml.load("") returns undefined
    expect(result.parsed?.data).toBeUndefined();
  });

  it("should handle simple scalar", () => {
    const result = parseYaml("hello\n");
    expect(result.parsed).toBeDefined();
    expect(result.parsed?.data).toBe("hello");
  });
});

describe("parseFrontmatterYaml", () => {
  it("should parse valid frontmatter", () => {
    const result = parseFrontmatterYaml("title: Test\nauthor: Me");
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.title).toBe("Test");
      expect(result.data.author).toBe("Me");
    }
  });

  it("should return error for invalid YAML", () => {
    const result = parseFrontmatterYaml("key: [\n  bad");
    expect("error" in result).toBe(true);
  });

  it("should return error for non-object frontmatter", () => {
    const result = parseFrontmatterYaml("- item1\n- item2");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("mapping");
    }
  });

  it("should handle empty frontmatter", () => {
    const result = parseFrontmatterYaml("");
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data).toEqual({});
    }
  });

  it("should handle null frontmatter", () => {
    const result = parseFrontmatterYaml("~");
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data).toEqual({});
    }
  });
});
