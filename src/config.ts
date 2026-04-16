/**
 * Configuration loader — reads .agentlintrc.json files and merges with defaults.
 */

import fs from "node:fs";
import path from "node:path";
import type { AgentLintConfig, RuleSetting } from "./types.js";

const CONFIG_FILENAMES = [
  ".agentlintrc.json",
  ".agentlintrc",
  "agentlint.config.json",
];

/** Default rule configuration — all rules enabled at their default severity */
export function getDefaultConfig(): AgentLintConfig {
  return {
    rules: {
      // Structural rules
      "struct-claude-md-sections": "warn",
      "struct-frontmatter-valid": "error",
      "struct-json-valid": "error",
      "struct-no-duplicate-agents": "error",
      // Reference rules
      "ref-file-exists": "warn",
      "ref-tool-registered": "warn",
      "ref-model-valid": "warn",
      "ref-hook-script-exists": "error",
      // Security rules
      "sec-no-secrets-in-config": "error",
      "sec-no-dangerous-hooks": "error",
      "sec-no-broad-permissions": "warn",
      "sec-no-shell-injection": "error",
      // Consistency rules
      "con-claude-mcp-sync": "warn",
      "con-agents-tools-sync": "warn",
      "con-settings-hooks-sync": "warn",
      "con-no-conflicting-rules": "warn",
      // Style rules
      "style-md-heading-hierarchy": "warn",
      "style-no-trailing-whitespace": "warn",
      "style-consistent-naming": "info",
      "style-line-length": "warn",
    },
    ignore: [],
    settings: {
      "style-line-length": { maxLength: 120 },
    },
  };
}

/**
 * Load configuration from the project directory, merging with defaults.
 */
export function loadConfig(projectRoot: string): AgentLintConfig {
  const defaults = getDefaultConfig();

  for (const filename of CONFIG_FILENAMES) {
    const configPath = path.join(projectRoot, filename);
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, { encoding: "utf-8" });
        const userConfig = JSON.parse(raw) as Partial<AgentLintConfig>;
        return mergeConfig(defaults, userConfig);
      } catch {
        // Invalid config file — use defaults
        return defaults;
      }
    }
  }

  return defaults;
}

/**
 * Merge user config over defaults. User rules override default rules.
 */
export function mergeConfig(
  defaults: AgentLintConfig,
  user: Partial<AgentLintConfig>
): AgentLintConfig {
  const merged: AgentLintConfig = { ...defaults };

  if (user.rules) {
    merged.rules = { ...defaults.rules, ...user.rules };
  }

  if (user.extends) {
    merged.extends = user.extends;
  }

  if (user.overrides) {
    merged.overrides = user.overrides;
  }

  if (user.ignore) {
    merged.ignore = [...(defaults.ignore ?? []), ...user.ignore];
  }

  if (user.settings) {
    merged.settings = { ...defaults.settings, ...user.settings };
  }

  return merged;
}

/**
 * Resolve the effective severity for a rule, accounting for overrides.
 */
export function resolveRuleSeverity(
  config: AgentLintConfig,
  ruleId: string,
  filePath: string
): RuleSetting {
  // Check overrides first (last matching override wins)
  if (config.overrides) {
    for (let i = config.overrides.length - 1; i >= 0; i--) {
      const override = config.overrides[i];
      if (ruleId in override.rules) {
        const fileMatches = override.files.some((pattern) =>
          matchSimpleGlob(filePath, pattern)
        );
        if (fileMatches) {
          return override.rules[ruleId];
        }
      }
    }
  }

  return config.rules[ruleId] ?? "off";
}

/**
 * Very simple glob matching for config overrides.
 * Supports * and ** patterns.
 */
function matchSimpleGlob(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  let regexStr = pattern
    .replace(/\\/g, "/")
    .replace(/\./g, "\\.")
    .replace(/\*\*\//g, "<<GLOBSTAR_SLASH>>")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GLOBSTAR_SLASH>>/g, "(?:.*/)?")
    .replace(/<<GLOBSTAR>>/g, ".*");

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(normalized);
}

/**
 * Generate a default .agentlintrc.json config file content.
 */
export function generateDefaultConfigFile(): string {
  const config = {
    rules: {
      "struct-claude-md-sections": "warn",
      "struct-frontmatter-valid": "error",
      "struct-json-valid": "error",
      "struct-no-duplicate-agents": "error",
      "ref-file-exists": "warn",
      "ref-tool-registered": "warn",
      "ref-model-valid": "warn",
      "ref-hook-script-exists": "error",
      "sec-no-secrets-in-config": "error",
      "sec-no-dangerous-hooks": "error",
      "sec-no-broad-permissions": "warn",
      "sec-no-shell-injection": "error",
      "con-claude-mcp-sync": "warn",
      "con-agents-tools-sync": "warn",
      "con-settings-hooks-sync": "warn",
      "con-no-conflicting-rules": "warn",
      "style-md-heading-hierarchy": "warn",
      "style-no-trailing-whitespace": "warn",
      "style-consistent-naming": "info",
      "style-line-length": "warn",
    },
    ignore: ["node_modules/**", ".git/**"],
    settings: {
      "style-line-length": { maxLength: 120 },
    },
  };

  return JSON.stringify(config, null, 2) + "\n";
}
