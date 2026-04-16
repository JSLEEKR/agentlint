/**
 * SARIF formatter — GitHub Code Scanning compatible output.
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */

import type { LintReport, SarifReport, SarifRule, SarifResult, Severity } from "../types.js";
import { allRules } from "../rules/index.js";

function severityToSarifLevel(severity: Severity): string {
  switch (severity) {
    case "error": return "error";
    case "warning": return "warning";
    case "info": return "note";
  }
}

export function formatSarif(report: LintReport): string {
  // Build rule index from all rules that produced results
  const usedRuleIds = new Set<string>();
  for (const result of report.results) {
    for (const diag of result.diagnostics) {
      usedRuleIds.add(diag.ruleId);
    }
  }

  const sarifRules: SarifRule[] = allRules
    .filter((r) => usedRuleIds.has(r.meta.id))
    .map((r) => ({
      id: r.meta.id,
      shortDescription: { text: r.meta.description },
      defaultConfiguration: {
        level: severityToSarifLevel(r.meta.defaultSeverity),
      },
      properties: { category: r.meta.category },
    }));

  const sarifResults: SarifResult[] = [];
  for (const result of report.results) {
    for (const diag of result.diagnostics) {
      sarifResults.push({
        ruleId: diag.ruleId,
        level: severityToSarifLevel(diag.severity),
        message: { text: diag.message },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: diag.file.replace(/\\/g, "/"),
              },
              region: {
                startLine: diag.line,
                startColumn: diag.column,
                endLine: diag.endLine,
                endColumn: diag.endColumn,
              },
            },
          },
        ],
      });
    }
  }

  const sarif: SarifReport = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "agentlint",
            version: "1.0.0",
            informationUri: "https://github.com/JSLEEKR/agentlint",
            rules: sarifRules,
          },
        },
        results: sarifResults,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
