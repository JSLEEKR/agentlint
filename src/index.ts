/**
 * agentlint — Cross-platform linter for AI agent configuration files.
 *
 * Public API for programmatic usage.
 */

export { lint } from "./engine.js";
export type { LintOptions } from "./engine.js";
export { loadConfig, getDefaultConfig, mergeConfig, generateDefaultConfigFile } from "./config.js";
export { scanFiles, classifyFile } from "./scanner.js";
export { allRules, getRule, getRulesByCategory, getRuleIds } from "./rules/index.js";
export { formatText } from "./formatters/text.js";
export { formatJson } from "./formatters/json-formatter.js";
export { formatSarif } from "./formatters/sarif.js";

export type {
  LintDiagnostic,
  LintReport,
  LintResult,
  LintFix,
  Rule,
  RuleContext,
  RuleDefinition,
  RuleCategory,
  Severity,
  FileType,
  ParsedFile,
  AgentLintConfig,
  RuleSetting,
  SarifReport,
} from "./types.js";
