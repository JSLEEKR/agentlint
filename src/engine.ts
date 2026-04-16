/**
 * Lint engine — orchestrates scanning, rule execution, and result collection.
 */

import type {
  AgentLintConfig,
  LintDiagnostic,
  LintReport,
  LintResult,
  Rule,
  RuleContext,
  Severity,
} from "./types.js";
import { scanFiles } from "./scanner.js";
import { loadConfig } from "./config.js";
import { allRules } from "./rules/index.js";
import { resolveRuleSeverity } from "./config.js";

export interface LintOptions {
  cwd: string;
  config?: AgentLintConfig;
  rules?: string[];
  ignore?: string[];
  fix?: boolean;
}

/**
 * Run the linter on a directory.
 */
export async function lint(options: LintOptions): Promise<LintReport> {
  const startTime = Date.now();
  const { cwd, fix = false } = options;

  // Load config
  const config = options.config ?? loadConfig(cwd);

  // Merge ignore patterns
  const ignore = [...(config.ignore ?? []), ...(options.ignore ?? [])];

  // Scan files
  const files = await scanFiles({ cwd, ignore });

  // Filter rules
  const rulesToRun = filterRules(options.rules);

  // Run rules
  const diagnostics: LintDiagnostic[] = [];

  for (const file of files) {
    for (const rule of rulesToRun) {
      // Check if rule applies to this file type
      if (!rule.meta.appliesTo.includes(file.type)) continue;

      // Check if rule is enabled
      const setting = resolveRuleSeverity(config, rule.meta.id, file.path);
      if (setting === "off") continue;

      // Determine effective severity
      const severity = resolveSeverityFromSetting(setting, rule.meta.defaultSeverity);

      // Create rule context
      const fileDiagnostics: LintDiagnostic[] = [];
      const ctx: RuleContext = {
        file,
        allFiles: files,
        projectRoot: cwd,
        config,
        report(diag) {
          fileDiagnostics.push({
            ...diag,
            ruleId: rule.meta.id,
            category: rule.meta.category,
            severity: diag.severity ?? severity,
          });
        },
      };

      try {
        await rule.check(ctx);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        fileDiagnostics.push({
          ruleId: rule.meta.id,
          severity: "error",
          message: `Rule "${rule.meta.id}" threw an error: ${message}`,
          file: file.path,
          line: 1,
          column: 1,
          category: rule.meta.category,
        });
      }

      diagnostics.push(...fileDiagnostics);
    }
  }

  // Apply fixes if requested
  if (fix) {
    await applyFixes(cwd, diagnostics);
  }

  // Group diagnostics by file
  const resultsByFile = new Map<string, LintDiagnostic[]>();
  for (const d of diagnostics) {
    const existing = resultsByFile.get(d.file) ?? [];
    existing.push(d);
    resultsByFile.set(d.file, existing);
  }

  const results: LintResult[] = [];
  for (const [file, fileDiags] of resultsByFile) {
    // Sort by line, then column
    fileDiags.sort((a, b) => a.line - b.line || a.column - b.column);
    results.push({ file, diagnostics: fileDiags });
  }

  // Sort results by file path
  results.sort((a, b) => a.file.localeCompare(b.file));

  const totalErrors = diagnostics.filter((d) => d.severity === "error").length;
  const totalWarnings = diagnostics.filter((d) => d.severity === "warning").length;
  const totalInfos = diagnostics.filter((d) => d.severity === "info").length;

  return {
    results,
    totalErrors,
    totalWarnings,
    totalInfos,
    rulesApplied: rulesToRun.map((r) => r.meta.id),
    filesScanned: files.length,
    durationMs: Date.now() - startTime,
  };
}

function filterRules(ruleIds?: string[]): Rule[] {
  if (!ruleIds || ruleIds.length === 0) {
    return allRules;
  }

  return allRules.filter((r) => ruleIds.includes(r.meta.id));
}

function resolveSeverityFromSetting(
  setting: string | [Severity, Record<string, unknown>],
  defaultSeverity: Severity
): Severity {
  if (typeof setting === "string") {
    if (setting === "error" || setting === "warn" || setting === "warning") return setting === "warn" ? "warning" : setting as Severity;
    return defaultSeverity;
  }

  if (Array.isArray(setting)) {
    return setting[0];
  }

  return defaultSeverity;
}

/**
 * Apply auto-fixes for fixable diagnostics.
 */
async function applyFixes(
  cwd: string,
  diagnostics: LintDiagnostic[]
): Promise<number> {
  const fs = await import("node:fs");
  const path = await import("node:path");

  // Group fixes by file
  const fixesByFile = new Map<string, LintDiagnostic[]>();
  for (const d of diagnostics) {
    if (!d.fix) continue;
    const existing = fixesByFile.get(d.file) ?? [];
    existing.push(d);
    fixesByFile.set(d.file, existing);
  }

  let fixCount = 0;

  for (const [relPath, fileDiags] of fixesByFile) {
    const absPath = path.resolve(cwd, relPath);
    let content: string;
    try {
      content = fs.readFileSync(absPath, { encoding: "utf-8" });
    } catch {
      continue;
    }

    const lines = content.split("\n");

    // Sort fixes by line (descending) to apply from bottom to top
    const sortedDiags = [...fileDiags].sort(
      (a, b) => (b.fix!.range.startLine - a.fix!.range.startLine) ||
                (b.fix!.range.startColumn - a.fix!.range.startColumn)
    );

    for (const diag of sortedDiags) {
      const fix = diag.fix!;
      const lineIdx = fix.range.startLine - 1;
      if (lineIdx < 0 || lineIdx >= lines.length) continue;

      const line = lines[lineIdx];
      const before = line.substring(0, fix.range.startColumn - 1);
      const after = line.substring(fix.range.endColumn - 1);
      lines[lineIdx] = before + fix.text + after;
      fixCount++;
    }

    fs.writeFileSync(absPath, lines.join("\n"), { encoding: "utf-8" });
  }

  return fixCount;
}
