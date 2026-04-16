/**
 * Tests for configuration loading and merging.
 */

import { describe, it, expect } from "vitest";
import {
  getDefaultConfig,
  mergeConfig,
  resolveRuleSeverity,
  generateDefaultConfigFile,
} from "../config.js";

describe("getDefaultConfig", () => {
  it("should return a config with all 20 rules", () => {
    const config = getDefaultConfig();
    const ruleCount = Object.keys(config.rules).length;
    expect(ruleCount).toBe(20);
  });

  it("should have struct rules", () => {
    const config = getDefaultConfig();
    expect(config.rules["struct-claude-md-sections"]).toBe("warn");
    expect(config.rules["struct-frontmatter-valid"]).toBe("error");
    expect(config.rules["struct-json-valid"]).toBe("error");
    expect(config.rules["struct-no-duplicate-agents"]).toBe("error");
  });

  it("should have ref rules", () => {
    const config = getDefaultConfig();
    expect(config.rules["ref-file-exists"]).toBe("warn");
    expect(config.rules["ref-tool-registered"]).toBe("warn");
    expect(config.rules["ref-model-valid"]).toBe("warn");
    expect(config.rules["ref-hook-script-exists"]).toBe("error");
  });

  it("should have sec rules", () => {
    const config = getDefaultConfig();
    expect(config.rules["sec-no-secrets-in-config"]).toBe("error");
    expect(config.rules["sec-no-dangerous-hooks"]).toBe("error");
    expect(config.rules["sec-no-broad-permissions"]).toBe("warn");
    expect(config.rules["sec-no-shell-injection"]).toBe("error");
  });

  it("should have con rules", () => {
    const config = getDefaultConfig();
    expect(config.rules["con-claude-mcp-sync"]).toBe("warn");
    expect(config.rules["con-agents-tools-sync"]).toBe("warn");
    expect(config.rules["con-settings-hooks-sync"]).toBe("warn");
    expect(config.rules["con-no-conflicting-rules"]).toBe("warn");
  });

  it("should have style rules", () => {
    const config = getDefaultConfig();
    expect(config.rules["style-md-heading-hierarchy"]).toBe("warn");
    expect(config.rules["style-no-trailing-whitespace"]).toBe("warn");
    expect(config.rules["style-consistent-naming"]).toBe("info");
    expect(config.rules["style-line-length"]).toBe("warn");
  });

  it("should have default settings for style-line-length", () => {
    const config = getDefaultConfig();
    const settings = config.settings?.["style-line-length"] as { maxLength: number };
    expect(settings.maxLength).toBe(120);
  });
});

describe("mergeConfig", () => {
  it("should override rules", () => {
    const defaults = getDefaultConfig();
    const merged = mergeConfig(defaults, {
      rules: { "struct-claude-md-sections": "error" },
    });
    expect(merged.rules["struct-claude-md-sections"]).toBe("error");
    // Other rules should remain
    expect(merged.rules["struct-json-valid"]).toBe("error");
  });

  it("should merge ignore patterns", () => {
    const defaults = getDefaultConfig();
    const merged = mergeConfig(defaults, {
      ignore: ["custom/**"],
    });
    expect(merged.ignore).toContain("custom/**");
  });

  it("should override settings", () => {
    const defaults = getDefaultConfig();
    const merged = mergeConfig(defaults, {
      settings: { "style-line-length": { maxLength: 200 } },
    });
    const settings = merged.settings?.["style-line-length"] as { maxLength: number };
    expect(settings.maxLength).toBe(200);
  });

  it("should preserve extends", () => {
    const defaults = getDefaultConfig();
    const merged = mergeConfig(defaults, {
      extends: ["recommended"],
    });
    expect(merged.extends).toEqual(["recommended"]);
  });

  it("should preserve overrides", () => {
    const defaults = getDefaultConfig();
    const merged = mergeConfig(defaults, {
      overrides: [{ files: ["*.md"], rules: { "style-line-length": "off" } }],
    });
    expect(merged.overrides).toHaveLength(1);
  });

  it("should turn off rules", () => {
    const defaults = getDefaultConfig();
    const merged = mergeConfig(defaults, {
      rules: { "style-line-length": "off" },
    });
    expect(merged.rules["style-line-length"]).toBe("off");
  });
});

describe("resolveRuleSeverity", () => {
  it("should return rule setting from config", () => {
    const config = getDefaultConfig();
    expect(resolveRuleSeverity(config, "struct-json-valid", "test.json")).toBe("error");
  });

  it("should return off for unknown rule", () => {
    const config = getDefaultConfig();
    expect(resolveRuleSeverity(config, "nonexistent", "test.json")).toBe("off");
  });

  it("should apply overrides for matching files", () => {
    const config = getDefaultConfig();
    config.overrides = [
      {
        files: ["**/*.md"],
        rules: { "style-line-length": "off" },
      },
    ];
    expect(resolveRuleSeverity(config, "style-line-length", "README.md")).toBe("off");
  });

  it("should not apply overrides for non-matching files", () => {
    const config = getDefaultConfig();
    config.overrides = [
      {
        files: ["**/*.md"],
        rules: { "style-line-length": "off" },
      },
    ];
    expect(resolveRuleSeverity(config, "style-line-length", "config.json")).toBe("warn");
  });

  it("should use last matching override", () => {
    const config = getDefaultConfig();
    config.overrides = [
      { files: ["**/*.md"], rules: { "style-line-length": "off" } },
      { files: ["**/CLAUDE.md"], rules: { "style-line-length": "error" } },
    ];
    expect(resolveRuleSeverity(config, "style-line-length", "CLAUDE.md")).toBe("error");
  });
});

describe("generateDefaultConfigFile", () => {
  it("should produce valid JSON", () => {
    const content = generateDefaultConfigFile();
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("should include all rule categories", () => {
    const content = generateDefaultConfigFile();
    const config = JSON.parse(content);
    expect(config.rules).toBeDefined();
    expect(Object.keys(config.rules).length).toBeGreaterThanOrEqual(20);
  });

  it("should include ignore patterns", () => {
    const content = generateDefaultConfigFile();
    const config = JSON.parse(content);
    expect(config.ignore).toBeDefined();
    expect(config.ignore).toContain("node_modules/**");
  });

  it("should include settings", () => {
    const content = generateDefaultConfigFile();
    const config = JSON.parse(content);
    expect(config.settings).toBeDefined();
    expect(config.settings["style-line-length"]).toBeDefined();
  });

  it("should end with newline", () => {
    const content = generateDefaultConfigFile();
    expect(content.endsWith("\n")).toBe(true);
  });
});
