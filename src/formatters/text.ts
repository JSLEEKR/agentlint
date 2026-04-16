/**
 * Text formatter — human-readable terminal output with file:line references.
 */

import type { LintReport, Severity } from "../types.js";

// ANSI color codes
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";
const UNDERLINE = "\x1b[4m";

function severityColor(severity: Severity): string {
  switch (severity) {
    case "error": return RED;
    case "warning": return YELLOW;
    case "info": return BLUE;
  }
}

function severityLabel(severity: Severity): string {
  switch (severity) {
    case "error": return "error";
    case "warning": return "warning";
    case "info": return "info";
  }
}

function severitySymbol(severity: Severity): string {
  switch (severity) {
    case "error": return "x";
    case "warning": return "!";
    case "info": return "i";
  }
}

export function formatText(report: LintReport, useColor: boolean = true): string {
  const lines: string[] = [];

  const c = (code: string, text: string): string =>
    useColor ? `${code}${text}${RESET}` : text;

  if (report.results.length === 0) {
    lines.push("");
    lines.push(c(BOLD, "agentlint: no issues found"));
    lines.push("");
    lines.push(c(GRAY, `  ${report.filesScanned} files scanned in ${report.durationMs}ms`));
    lines.push("");
    return lines.join("\n");
  }

  for (const result of report.results) {
    lines.push("");
    lines.push(c(UNDERLINE, result.file));

    for (const diag of result.diagnostics) {
      const color = severityColor(diag.severity);
      const symbol = severitySymbol(diag.severity);
      const label = severityLabel(diag.severity);
      const location = `${diag.line}:${diag.column}`;
      const fixHint = diag.fix ? c(GRAY, " (fixable)") : "";

      lines.push(
        `  ${c(GRAY, location.padEnd(8))}` +
        `${c(color, `${symbol} ${label.padEnd(8)}`)}` +
        `${diag.message}${fixHint}` +
        `  ${c(GRAY, diag.ruleId)}`
      );
    }
  }

  lines.push("");

  // Summary
  const parts: string[] = [];
  if (report.totalErrors > 0) {
    parts.push(c(RED, `${report.totalErrors} error${report.totalErrors !== 1 ? "s" : ""}`));
  }
  if (report.totalWarnings > 0) {
    parts.push(c(YELLOW, `${report.totalWarnings} warning${report.totalWarnings !== 1 ? "s" : ""}`));
  }
  if (report.totalInfos > 0) {
    parts.push(c(BLUE, `${report.totalInfos} info${report.totalInfos !== 1 ? "s" : ""}`));
  }

  const total = report.totalErrors + report.totalWarnings + report.totalInfos;
  lines.push(
    c(BOLD, `  ${total} problem${total !== 1 ? "s" : ""} `) +
    `(${parts.join(", ")})`
  );

  const fixableCount = report.results.reduce(
    (acc, r) => acc + r.diagnostics.filter((d) => d.fix).length,
    0
  );
  if (fixableCount > 0) {
    lines.push(c(GRAY, `  ${fixableCount} fixable with --fix`));
  }

  lines.push(c(GRAY, `  ${report.filesScanned} files scanned in ${report.durationMs}ms`));
  lines.push("");

  return lines.join("\n");
}
