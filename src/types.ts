/**
 * Core types for agentlint
 */

export type Severity = "error" | "warning" | "info";

export interface LintDiagnostic {
  ruleId: string;
  severity: Severity;
  message: string;
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  fix?: LintFix;
  category: RuleCategory;
}

export interface LintFix {
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  text: string;
  description: string;
}

export type RuleCategory =
  | "struct"
  | "ref"
  | "sec"
  | "con"
  | "style";

export interface RuleDefinition {
  id: string;
  description: string;
  category: RuleCategory;
  defaultSeverity: Severity;
  fixable: boolean;
  appliesTo: FileType[];
}

export type FileType =
  | "claude-md"
  | "agents-md"
  | "soul-md"
  | "cursorrules"
  | "claude-json"
  | "settings-json"
  | "mcp-json"
  | "hook-config"
  | "generic-md"
  | "generic-json"
  | "generic-yaml";

export interface ParsedFile {
  path: string;
  type: FileType;
  content: string;
  lines: string[];
  parsed?: ParsedContent;
  parseError?: string;
}

export type ParsedContent =
  | MarkdownParsed
  | JsonParsed
  | YamlParsed;

export interface MarkdownParsed {
  kind: "markdown";
  frontmatter?: Record<string, unknown>;
  frontmatterRaw?: string;
  frontmatterStartLine: number;
  frontmatterEndLine: number;
  headings: MarkdownHeading[];
  codeBlocks: CodeBlock[];
  links: MarkdownLink[];
  references: FileReference[];
}

export interface MarkdownHeading {
  level: number;
  text: string;
  line: number;
}

export interface CodeBlock {
  language: string;
  content: string;
  startLine: number;
  endLine: number;
}

export interface MarkdownLink {
  text: string;
  url: string;
  line: number;
  column: number;
}

export interface FileReference {
  path: string;
  line: number;
  column: number;
  context: string;
}

export interface JsonParsed {
  kind: "json";
  data: unknown;
}

export interface YamlParsed {
  kind: "yaml";
  data: unknown;
}

export interface RuleContext {
  file: ParsedFile;
  allFiles: ParsedFile[];
  projectRoot: string;
  config: AgentLintConfig;
  report: (diagnostic: Omit<LintDiagnostic, "ruleId" | "category">) => void;
}

export interface Rule {
  meta: RuleDefinition;
  check(ctx: RuleContext): void | Promise<void>;
}

export interface AgentLintConfig {
  rules: Record<string, RuleSetting>;
  extends?: string[];
  overrides?: ConfigOverride[];
  ignore?: string[];
  settings?: Record<string, unknown>;
}

export type RuleSetting =
  | "off"
  | "warn"
  | "error"
  | "info"
  | [Severity, Record<string, unknown>];

export interface ConfigOverride {
  files: string[];
  rules: Record<string, RuleSetting>;
}

export interface LintResult {
  file: string;
  diagnostics: LintDiagnostic[];
}

export interface LintReport {
  results: LintResult[];
  totalErrors: number;
  totalWarnings: number;
  totalInfos: number;
  rulesApplied: string[];
  filesScanned: number;
  durationMs: number;
}

export interface SarifReport {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

export interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
}

export interface SarifRule {
  id: string;
  shortDescription: { text: string };
  defaultConfiguration: { level: string };
  properties: { category: string };
}

export interface SarifResult {
  ruleId: string;
  level: string;
  message: { text: string };
  locations: SarifLocation[];
}

export interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string };
    region: {
      startLine: number;
      startColumn: number;
      endLine?: number;
      endColumn?: number;
    };
  };
}

/** Known valid model names for ref-model-valid rule */
export const KNOWN_MODELS = new Set([
  // Claude models
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-5-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-3-5-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet-20240620",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
  "claude-opus-4-6",
  // Shorthand aliases
  "claude-sonnet-4-5",
  "claude-sonnet-4",
  "claude-opus-4",
  "claude-haiku-3-5",
  "claude-3-5-sonnet",
  "claude-3-5-haiku",
  "claude-3-opus",
  "claude-3-sonnet",
  "claude-3-haiku",
  // GPT models
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
  "o1",
  "o1-mini",
  "o1-preview",
  "o3",
  "o3-mini",
  "o4-mini",
  // Gemini models
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
]);

/** Dangerous shell patterns for security rules */
export const DANGEROUS_SHELL_PATTERNS = [
  { pattern: /rm\s+-rf\s+[\/~]/, description: "recursive force delete from root or home" },
  { pattern: /curl\s+.*\|\s*(?:ba)?sh/, description: "piping curl to shell" },
  { pattern: /wget\s+.*\|\s*(?:ba)?sh/, description: "piping wget to shell" },
  { pattern: /eval\s*\(/, description: "eval() usage" },
  { pattern: /\beval\s+["'\$]/, description: "shell eval with variable" },
  { pattern: />\s*\/dev\/sd[a-z]/, description: "writing to raw device" },
  { pattern: /mkfs\./, description: "filesystem format command" },
  { pattern: /dd\s+if=/, description: "dd raw disk operation" },
  { pattern: /chmod\s+777/, description: "world-writable permissions" },
  { pattern: /chmod\s+\+s/, description: "setuid bit" },
  { pattern: /:\(\)\{\s*:\|:&\s*\};:/, description: "fork bomb" },
  { pattern: /git\s+push\s+--force\s+origin\s+(?:master|main)/, description: "force push to main branch" },
  { pattern: /DROP\s+(?:TABLE|DATABASE)/i, description: "SQL drop statement" },
];

/** Secret patterns for sec-no-secrets-in-config rule */
export const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}["']?/i, name: "API key" },
  { pattern: /(?:secret|token|password|passwd|pwd)\s*[:=]\s*["']?[A-Za-z0-9_\-]{8,}["']?/i, name: "Secret/Token/Password" },
  { pattern: /sk-[A-Za-z0-9]{20,}/, name: "OpenAI API key" },
  { pattern: /sk-ant-[A-Za-z0-9\-]{20,}/, name: "Anthropic API key" },
  { pattern: /ghp_[A-Za-z0-9]{36,}/, name: "GitHub personal access token" },
  { pattern: /gho_[A-Za-z0-9]{36,}/, name: "GitHub OAuth token" },
  { pattern: /github_pat_[A-Za-z0-9_]{30,}/, name: "GitHub fine-grained PAT" },
  { pattern: /xoxb-[0-9]{10,}-[A-Za-z0-9]{20,}/, name: "Slack bot token" },
  { pattern: /xoxp-[0-9]{10,}-[A-Za-z0-9]{20,}/, name: "Slack user token" },
  { pattern: /AKIA[A-Z0-9]{16}/, name: "AWS access key" },
  { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, name: "Private key" },
  { pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s]+@[^\s]+/, name: "Database connection string with credentials" },
];
