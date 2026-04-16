/**
 * JSON formatter — structured output for scripting and CI.
 */

import type { LintReport } from "../types.js";

export interface JsonOutput {
  version: string;
  results: JsonFileResult[];
  summary: JsonSummary;
}

export interface JsonFileResult {
  file: string;
  diagnostics: JsonDiagnostic[];
}

export interface JsonDiagnostic {
  ruleId: string;
  severity: string;
  category: string;
  message: string;
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  fixable: boolean;
  fix?: {
    description: string;
    range: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
    text: string;
  };
}

export interface JsonSummary {
  filesScanned: number;
  totalErrors: number;
  totalWarnings: number;
  totalInfos: number;
  totalProblems: number;
  fixableProblems: number;
  rulesApplied: string[];
  durationMs: number;
}

export function formatJson(report: LintReport): string {
  const output: JsonOutput = {
    version: "1.0.0",
    results: report.results.map((r) => ({
      file: r.file,
      diagnostics: r.diagnostics.map((d) => ({
        ruleId: d.ruleId,
        severity: d.severity,
        category: d.category,
        message: d.message,
        file: d.file,
        line: d.line,
        column: d.column,
        endLine: d.endLine,
        endColumn: d.endColumn,
        fixable: d.fix !== undefined,
        fix: d.fix
          ? {
              description: d.fix.description,
              range: d.fix.range,
              text: d.fix.text,
            }
          : undefined,
      })),
    })),
    summary: {
      filesScanned: report.filesScanned,
      totalErrors: report.totalErrors,
      totalWarnings: report.totalWarnings,
      totalInfos: report.totalInfos,
      totalProblems: report.totalErrors + report.totalWarnings + report.totalInfos,
      fixableProblems: report.results.reduce(
        (acc, r) => acc + r.diagnostics.filter((d) => d.fix).length,
        0
      ),
      rulesApplied: report.rulesApplied,
      durationMs: report.durationMs,
    },
  };

  return JSON.stringify(output, null, 2);
}
