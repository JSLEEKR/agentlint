/**
 * Tests for output formatters.
 */

import { describe, it, expect } from "vitest";
import { formatText } from "../formatters/text.js";
import { formatJson } from "../formatters/json-formatter.js";
import { formatSarif } from "../formatters/sarif.js";
import type { LintReport, LintDiagnostic } from "../types.js";

function makeReport(diagnostics: LintDiagnostic[] = []): LintReport {
  const results = diagnostics.length > 0
    ? [{ file: "CLAUDE.md", diagnostics }]
    : [];

  return {
    results,
    totalErrors: diagnostics.filter((d) => d.severity === "error").length,
    totalWarnings: diagnostics.filter((d) => d.severity === "warning").length,
    totalInfos: diagnostics.filter((d) => d.severity === "info").length,
    rulesApplied: ["test-rule"],
    filesScanned: 1,
    durationMs: 42,
  };
}

function makeDiag(overrides: Partial<LintDiagnostic> = {}): LintDiagnostic {
  return {
    ruleId: "test-rule",
    severity: "warning",
    message: "Test message",
    file: "CLAUDE.md",
    line: 1,
    column: 1,
    category: "struct",
    ...overrides,
  };
}

describe("formatText", () => {
  it("should show 'no issues found' for clean report", () => {
    const report = makeReport();
    report.results = [];
    const output = formatText(report, false);
    expect(output).toContain("no issues found");
  });

  it("should show file path for results", () => {
    const report = makeReport([makeDiag()]);
    const output = formatText(report, false);
    expect(output).toContain("CLAUDE.md");
  });

  it("should show rule ID", () => {
    const report = makeReport([makeDiag({ ruleId: "struct-json-valid" })]);
    const output = formatText(report, false);
    expect(output).toContain("struct-json-valid");
  });

  it("should show message", () => {
    const report = makeReport([makeDiag({ message: "Something went wrong" })]);
    const output = formatText(report, false);
    expect(output).toContain("Something went wrong");
  });

  it("should show line:column", () => {
    const report = makeReport([makeDiag({ line: 5, column: 10 })]);
    const output = formatText(report, false);
    expect(output).toContain("5:10");
  });

  it("should show summary counts", () => {
    const report = makeReport([
      makeDiag({ severity: "error" }),
      makeDiag({ severity: "warning" }),
      makeDiag({ severity: "info" }),
    ]);
    const output = formatText(report, false);
    expect(output).toContain("1 error");
    expect(output).toContain("1 warning");
    expect(output).toContain("1 info");
  });

  it("should show fixable count", () => {
    const report = makeReport([
      makeDiag({
        fix: {
          range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 },
          text: "",
          description: "fix it",
        },
      }),
    ]);
    const output = formatText(report, false);
    expect(output).toContain("fixable");
  });

  it("should show duration", () => {
    const report = makeReport();
    report.results = [];
    const output = formatText(report, false);
    expect(output).toContain("42ms");
  });

  it("should handle color mode", () => {
    const report = makeReport([makeDiag({ severity: "error" })]);
    const colorOutput = formatText(report, true);
    const plainOutput = formatText(report, false);
    // Color output should have ANSI codes
    expect(colorOutput.length).toBeGreaterThan(plainOutput.length);
  });

  it("should pluralize correctly", () => {
    const report = makeReport([makeDiag(), makeDiag()]);
    const output = formatText(report, false);
    expect(output).toContain("problems");
    expect(output).toContain("warnings");
  });

  it("should show (fixable) hint for fixable diagnostics", () => {
    const report = makeReport([
      makeDiag({
        fix: {
          range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 },
          text: "fixed",
          description: "test fix",
        },
      }),
    ]);
    const output = formatText(report, false);
    expect(output).toContain("(fixable)");
  });
});

describe("formatJson", () => {
  it("should produce valid JSON", () => {
    const report = makeReport([makeDiag()]);
    const output = formatJson(report);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("should include version", () => {
    const report = makeReport();
    const parsed = JSON.parse(formatJson(report));
    expect(parsed.version).toBe("1.0.0");
  });

  it("should include results", () => {
    const report = makeReport([makeDiag()]);
    const parsed = JSON.parse(formatJson(report));
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].diagnostics).toHaveLength(1);
  });

  it("should include summary", () => {
    const report = makeReport([
      makeDiag({ severity: "error" }),
      makeDiag({ severity: "warning" }),
    ]);
    const parsed = JSON.parse(formatJson(report));
    expect(parsed.summary.totalErrors).toBe(1);
    expect(parsed.summary.totalWarnings).toBe(1);
    expect(parsed.summary.totalProblems).toBe(2);
  });

  it("should include diagnostic details", () => {
    const report = makeReport([
      makeDiag({
        ruleId: "test-rule",
        message: "Test",
        line: 5,
        column: 10,
        category: "struct",
      }),
    ]);
    const parsed = JSON.parse(formatJson(report));
    const diag = parsed.results[0].diagnostics[0];
    expect(diag.ruleId).toBe("test-rule");
    expect(diag.message).toBe("Test");
    expect(diag.line).toBe(5);
    expect(diag.column).toBe(10);
    expect(diag.category).toBe("struct");
  });

  it("should include fixable flag", () => {
    const report = makeReport([
      makeDiag({
        fix: {
          range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 },
          text: "",
          description: "fix",
        },
      }),
    ]);
    const parsed = JSON.parse(formatJson(report));
    expect(parsed.results[0].diagnostics[0].fixable).toBe(true);
  });

  it("should include fix details when present", () => {
    const report = makeReport([
      makeDiag({
        fix: {
          range: { startLine: 1, startColumn: 6, endLine: 1, endColumn: 9 },
          text: "",
          description: "Remove trailing whitespace",
        },
      }),
    ]);
    const parsed = JSON.parse(formatJson(report));
    const fix = parsed.results[0].diagnostics[0].fix;
    expect(fix.description).toBe("Remove trailing whitespace");
    expect(fix.range.startLine).toBe(1);
  });

  it("should include fixableProblems in summary", () => {
    const report = makeReport([
      makeDiag({
        fix: {
          range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 },
          text: "",
          description: "fix",
        },
      }),
      makeDiag(),
    ]);
    const parsed = JSON.parse(formatJson(report));
    expect(parsed.summary.fixableProblems).toBe(1);
  });

  it("should include durationMs", () => {
    const report = makeReport();
    const parsed = JSON.parse(formatJson(report));
    expect(parsed.summary.durationMs).toBe(42);
  });

  it("should handle empty results", () => {
    const report = makeReport();
    report.results = [];
    const parsed = JSON.parse(formatJson(report));
    expect(parsed.results).toHaveLength(0);
  });
});

describe("formatSarif", () => {
  it("should produce valid JSON", () => {
    const report = makeReport([makeDiag()]);
    const output = formatSarif(report);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("should include SARIF schema", () => {
    const report = makeReport();
    const parsed = JSON.parse(formatSarif(report));
    expect(parsed.$schema).toContain("sarif");
    expect(parsed.version).toBe("2.1.0");
  });

  it("should include tool information", () => {
    const report = makeReport();
    const parsed = JSON.parse(formatSarif(report));
    expect(parsed.runs[0].tool.driver.name).toBe("agentlint");
    expect(parsed.runs[0].tool.driver.version).toBe("1.0.0");
  });

  it("should include results", () => {
    const report = makeReport([makeDiag()]);
    const parsed = JSON.parse(formatSarif(report));
    expect(parsed.runs[0].results).toHaveLength(1);
  });

  it("should map error severity to error level", () => {
    const report = makeReport([makeDiag({ severity: "error" })]);
    const parsed = JSON.parse(formatSarif(report));
    expect(parsed.runs[0].results[0].level).toBe("error");
  });

  it("should map warning severity to warning level", () => {
    const report = makeReport([makeDiag({ severity: "warning" })]);
    const parsed = JSON.parse(formatSarif(report));
    expect(parsed.runs[0].results[0].level).toBe("warning");
  });

  it("should map info severity to note level", () => {
    const report = makeReport([makeDiag({ severity: "info" })]);
    const parsed = JSON.parse(formatSarif(report));
    expect(parsed.runs[0].results[0].level).toBe("note");
  });

  it("should include location information", () => {
    const report = makeReport([makeDiag({ line: 5, column: 10 })]);
    const parsed = JSON.parse(formatSarif(report));
    const loc = parsed.runs[0].results[0].locations[0].physicalLocation;
    expect(loc.region.startLine).toBe(5);
    expect(loc.region.startColumn).toBe(10);
  });

  it("should include artifact location", () => {
    const report = makeReport([makeDiag({ file: "test/CLAUDE.md" })]);
    const parsed = JSON.parse(formatSarif(report));
    const uri = parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri;
    expect(uri).toBe("test/CLAUDE.md");
  });

  it("should include rule definitions", () => {
    const report = makeReport([makeDiag({ ruleId: "test-rule" })]);
    const parsed = JSON.parse(formatSarif(report));
    // Rules are populated from the allRules registry only for used rules
    // test-rule won't match any real rule, so rules array may be empty
    expect(parsed.runs[0].tool.driver.rules).toBeDefined();
  });

  it("should normalize Windows paths", () => {
    const report = makeReport([makeDiag({ file: "test\\CLAUDE.md" })]);
    const parsed = JSON.parse(formatSarif(report));
    const uri = parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri;
    expect(uri).not.toContain("\\");
    expect(uri).toBe("test/CLAUDE.md");
  });

  it("should handle empty report", () => {
    const report = makeReport();
    report.results = [];
    const parsed = JSON.parse(formatSarif(report));
    expect(parsed.runs[0].results).toHaveLength(0);
  });
});
