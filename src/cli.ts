#!/usr/bin/env node
/**
 * agentlint CLI — cross-platform linter for AI agent configuration files.
 */

import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import { lint } from "./engine.js";
import { allRules } from "./rules/index.js";
import { formatText } from "./formatters/text.js";
import { formatJson } from "./formatters/json-formatter.js";
import { formatSarif } from "./formatters/sarif.js";
import { generateDefaultConfigFile } from "./config.js";

const VERSION = "1.0.0";

const program = new Command();

program
  .name("agentlint")
  .description("Cross-platform linter for AI agent configuration files")
  .version(VERSION);

program
  .command("lint")
  .description("Scan directory for agent config files and validate")
  .argument("[dir]", "Directory to scan", ".")
  .option("-f, --format <format>", "Output format: text, json, sarif", "text")
  .option("--fix", "Auto-fix fixable issues", false)
  .option("-r, --rule <rule>", "Run specific rule only (can be repeated)", collectRules, [])
  .option("-i, --ignore <pattern>", "Skip files matching pattern (can be repeated)", collectIgnore, [])
  .option("--no-color", "Disable colored output")
  .option("-q, --quiet", "Only show errors (suppress warnings and info)", false)
  .action(async (dir: string, options: LintCommandOptions) => {
    try {
      const cwd = path.resolve(dir);

      if (!fs.existsSync(cwd)) {
        console.error(`Error: Directory does not exist: ${cwd}`);
        process.exit(3);
      }

      const report = await lint({
        cwd,
        rules: options.rule.length > 0 ? options.rule : undefined,
        ignore: options.ignore,
        fix: options.fix,
      });

      // Filter by quiet mode
      if (options.quiet) {
        for (const result of report.results) {
          result.diagnostics = result.diagnostics.filter((d) => d.severity === "error");
        }
        report.results = report.results.filter((r) => r.diagnostics.length > 0);
      }

      // Format output
      let output: string;
      switch (options.format) {
        case "json":
          output = formatJson(report);
          break;
        case "sarif":
          output = formatSarif(report);
          break;
        case "text":
        default:
          output = formatText(report, options.color !== false);
          break;
      }

      console.log(output);

      // Exit code
      if (report.totalErrors > 0) {
        process.exit(2);
      } else if (report.totalWarnings > 0) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Internal error: ${message}`);
      process.exit(3);
    }
  });

program
  .command("rules")
  .description("List all built-in rules with descriptions")
  .option("--format <format>", "Output format: text, json", "text")
  .action((options: { format: string }) => {
    if (options.format === "json") {
      const rules = allRules.map((r) => ({
        id: r.meta.id,
        description: r.meta.description,
        category: r.meta.category,
        defaultSeverity: r.meta.defaultSeverity,
        fixable: r.meta.fixable,
        appliesTo: r.meta.appliesTo,
      }));
      console.log(JSON.stringify(rules, null, 2));
    } else {
      console.log("");
      console.log("  agentlint rules");
      console.log("  ===============");
      console.log("");

      const categories = ["struct", "ref", "sec", "con", "style"];
      for (const cat of categories) {
        const catRules = allRules.filter((r) => r.meta.category === cat);
        const catLabel = getCategoryLabel(cat);
        console.log(`  ${catLabel}`);
        console.log(`  ${"─".repeat(catLabel.length)}`);

        for (const rule of catRules) {
          const fixIcon = rule.meta.fixable ? " [fixable]" : "";
          const sevIcon = rule.meta.defaultSeverity === "error" ? "E" :
                         rule.meta.defaultSeverity === "warning" ? "W" : "I";
          console.log(`    ${sevIcon}  ${rule.meta.id.padEnd(30)} ${rule.meta.description}${fixIcon}`);
        }
        console.log("");
      }

      console.log(`  Total: ${allRules.length} rules`);
      console.log("");
    }
  });

program
  .command("init")
  .description("Create a .agentlintrc.json config file")
  .option("--force", "Overwrite existing config", false)
  .action((options: { force: boolean }) => {
    const configPath = path.resolve(".agentlintrc.json");

    if (fs.existsSync(configPath) && !options.force) {
      console.error("Config file already exists: .agentlintrc.json");
      console.error("Use --force to overwrite.");
      process.exit(1);
    }

    const content = generateDefaultConfigFile();
    fs.writeFileSync(configPath, content, { encoding: "utf-8" });
    console.log("Created .agentlintrc.json with default configuration.");
  });

function getCategoryLabel(cat: string): string {
  switch (cat) {
    case "struct": return "Structural Rules (struct-*)";
    case "ref": return "Reference Rules (ref-*)";
    case "sec": return "Security Rules (sec-*)";
    case "con": return "Consistency Rules (con-*)";
    case "style": return "Style Rules (style-*)";
    default: return cat;
  }
}

function collectRules(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function collectIgnore(value: string, previous: string[]): string[] {
  return [...previous, value];
}

interface LintCommandOptions {
  format: string;
  fix: boolean;
  rule: string[];
  ignore: string[];
  color?: boolean;
  quiet: boolean;
}

program.parse();
