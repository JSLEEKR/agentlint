[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![tests](https://img.shields.io/badge/tests-305-brightgreen.svg?style=for-the-badge)](https://github.com/JSLEEKR/agentlint)
[![SARIF](https://img.shields.io/badge/Output-SARIF%202.1-purple.svg?style=for-the-badge)](https://sarifweb.azurewebsites.net/)

# agentlint

**Cross-platform linter for AI agent configuration files.** Validates CLAUDE.md, AGENTS.md, SOUL.md, .cursorrules, MCP configs, and hook scripts for structural correctness, dead references, permission conflicts, security anti-patterns, and cross-file consistency.

Think **ESLint, but for the agent harness layer.**

## Why This Exists

The agent harness ecosystem has exploded. `everything-claude-code` has 113K+ stars. The AGENTS.md standard is in 60K+ open-source projects. `awesome-claude-code` catalogs hundreds of skills and hooks. Every serious project now ships with CLAUDE.md, AGENTS.md, .cursorrules, MCP configs, or some combination.

**But there is no open-source, standalone CLI that validates these files in CI.**

Three tools exist in the space:

| Tool | Limitation |
|------|-----------|
| **cclint** | Claude Code only. No AGENTS.md, SOUL.md, .cursorrules, MCP. No SARIF. |
| **AgentLinter.com** | Hosted SaaS. Not open-source. Not self-hosted. Not CI-friendly. |
| **agnix** | VS Code extension only. Cannot run in CI pipelines. |

agentlint fills the gap with a focused TypeScript CLI that validates **all major agent config formats** in one pass, with CI-friendly JSON and SARIF output.

## Installation

```bash
# Global install
npm install -g agentlint

# Or use directly with npx
npx agentlint lint .

# Or add as dev dependency
npm install --save-dev agentlint
```

## Quick Start

```bash
# Lint the current directory
agentlint lint .

# Lint with JSON output for CI
agentlint lint . --format json

# Lint with SARIF for GitHub Code Scanning
agentlint lint . --format sarif > results.sarif

# Auto-fix fixable issues
agentlint lint . --fix

# Run a specific rule only
agentlint lint . --rule sec-no-secrets-in-config

# List all rules
agentlint rules

# Create a config file
agentlint init
```

## Supported File Formats

| File | Type | Description |
|------|------|-------------|
| `CLAUDE.md` | claude-md | Claude Code project instructions |
| `AGENTS.md` | agents-md | Agent definitions (Linux Foundation standard) |
| `SOUL.md` | soul-md | Agent personality/behavior definitions |
| `.cursorrules` | cursorrules | Cursor editor rules |
| `.claude.json` | claude-json | Claude Code configuration |
| `.claude/settings.json` | settings-json | Claude Code settings with hooks |
| `.claude/settings.local.json` | settings-json | Local Claude Code settings |
| `claude_desktop_config.json` | claude-json | Claude Desktop configuration |
| `.mcp.json` / `mcp.json` | mcp-json | MCP server definitions |
| `.claude/hooks/*.js` | hook-config | Hook scripts |
| `.hooks/*.sh` | hook-config | Hook scripts (shell) |

## Built-in Rules (20 rules)

### Structural Rules (struct-*)

| Rule | Default | Fixable | Description |
|------|---------|---------|-------------|
| `struct-claude-md-sections` | warn | No | CLAUDE.md should have clear sections with headings |
| `struct-frontmatter-valid` | error | No | YAML frontmatter must parse without errors |
| `struct-json-valid` | error | No | JSON configuration files must be valid JSON |
| `struct-no-duplicate-agents` | error | No | AGENTS.md must not define the same agent name twice |

### Reference Rules (ref-*)

| Rule | Default | Fixable | Description |
|------|---------|---------|-------------|
| `ref-file-exists` | warn | No | Referenced file paths must exist on disk |
| `ref-tool-registered` | warn | No | Tool names in docs must be registered in MCP config |
| `ref-model-valid` | warn | No | Model names must be known valid models |
| `ref-hook-script-exists` | error | No | Hook config must reference existing scripts |

### Security Rules (sec-*)

| Rule | Default | Fixable | Description |
|------|---------|---------|-------------|
| `sec-no-secrets-in-config` | error | No | No API keys, tokens, or passwords in config files |
| `sec-no-dangerous-hooks` | error | No | No dangerous shell commands in hook scripts |
| `sec-no-broad-permissions` | warn | No | Avoid overly broad tool permission patterns |
| `sec-no-shell-injection` | error | No | No unsanitized variable interpolation in hooks |

### Consistency Rules (con-*)

| Rule | Default | Fixable | Description |
|------|---------|---------|-------------|
| `con-claude-mcp-sync` | warn | No | Tools in CLAUDE.md must match MCP config |
| `con-agents-tools-sync` | warn | No | Agent tool references must be available |
| `con-settings-hooks-sync` | warn | No | Settings and hooks must not contradict |
| `con-no-conflicting-rules` | warn | No | .cursorrules and CLAUDE.md must not conflict |

### Style Rules (style-*)

| Rule | Default | Fixable | Description |
|------|---------|---------|-------------|
| `style-md-heading-hierarchy` | warn | No | Headings should follow h1 > h2 > h3 order |
| `style-no-trailing-whitespace` | warn | Yes | No trailing whitespace |
| `style-consistent-naming` | info | No | Consistent naming conventions in JSON keys |
| `style-line-length` | warn | No | Lines should not exceed configurable max (120) |

## Configuration

Create a `.agentlintrc.json` file in your project root:

```bash
agentlint init
```

### Configuration Format

```json
{
  "rules": {
    "struct-claude-md-sections": "warn",
    "struct-frontmatter-valid": "error",
    "struct-json-valid": "error",
    "sec-no-secrets-in-config": "error",
    "style-line-length": "warn",
    "style-no-trailing-whitespace": "off"
  },
  "ignore": [
    "node_modules/**",
    ".git/**",
    "vendor/**"
  ],
  "settings": {
    "style-line-length": { "maxLength": 120 }
  },
  "overrides": [
    {
      "files": ["**/*.md"],
      "rules": {
        "style-line-length": "off"
      }
    }
  ]
}
```

### Rule Severity

- `"error"` - Exit code 2. CI should fail.
- `"warn"` - Exit code 1. CI advisory.
- `"info"` - Exit code 0. Informational only.
- `"off"` - Rule is disabled.

### Extends (Shared Configs)

```json
{
  "extends": ["recommended"],
  "rules": {
    "style-line-length": "off"
  }
}
```

### Per-File Overrides

```json
{
  "overrides": [
    {
      "files": ["**/CLAUDE.md"],
      "rules": {
        "style-line-length": "off"
      }
    }
  ]
}
```

## Output Formats

### Text (default)

Human-readable terminal output with colors and file:line references:

```
CLAUDE.md
  1:1     ! warning  CLAUDE.md has no ## (h2) headings    struct-claude-md-sections
  5:40    x error    Potential GitHub personal access token sec-no-secrets-in-config

.claude/settings.json
  3:1     x error    Hook "pre_check" references non-existent script  ref-hook-script-exists

  3 problems (2 errors, 1 warning)
  1 file scanned in 12ms
```

### JSON

Structured output for scripting and CI:

```bash
agentlint lint . --format json
```

```json
{
  "version": "1.0.0",
  "results": [
    {
      "file": "CLAUDE.md",
      "diagnostics": [
        {
          "ruleId": "struct-claude-md-sections",
          "severity": "warning",
          "category": "struct",
          "message": "CLAUDE.md has no ## (h2) headings",
          "file": "CLAUDE.md",
          "line": 1,
          "column": 1,
          "fixable": false
        }
      ]
    }
  ],
  "summary": {
    "filesScanned": 1,
    "totalErrors": 0,
    "totalWarnings": 1,
    "totalInfos": 0,
    "totalProblems": 1,
    "fixableProblems": 0,
    "durationMs": 12
  }
}
```

### SARIF (GitHub Code Scanning)

```bash
agentlint lint . --format sarif > agentlint.sarif
```

Upload to GitHub Code Scanning:

```yaml
# .github/workflows/agentlint.yml
name: agentlint
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx agentlint lint . --format sarif > results.sarif
        continue-on-error: true
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Clean (no errors or warnings, info only) |
| 1 | Warnings found (no errors) |
| 2 | Errors found |
| 3 | Internal error (crash, invalid arguments) |

## CLI Reference

```
Usage: agentlint [command] [options]

Commands:
  lint [dir]    Scan directory for agent config files and validate
  rules         List all built-in rules with descriptions
  init          Create a .agentlintrc.json config file

Lint Options:
  -f, --format <format>   Output format: text, json, sarif (default: text)
  --fix                   Auto-fix fixable issues
  -r, --rule <rule>       Run specific rule only (repeatable)
  -i, --ignore <pattern>  Skip files matching pattern (repeatable)
  --no-color              Disable colored output
  -q, --quiet             Only show errors

Global Options:
  -V, --version           Output version number
  -h, --help              Display help
```

## Programmatic API

```typescript
import { lint, formatJson, formatSarif, allRules } from "agentlint";

// Run linter
const report = await lint({ cwd: "./my-project" });

// Format results
const json = formatJson(report);
const sarif = formatSarif(report);

// Access rules
console.log(`${allRules.length} rules available`);
```

## Comparison with Existing Tools

| Feature | agentlint | markdownlint | yamllint | ESLint |
|---------|-----------|-------------|----------|--------|
| CLAUDE.md validation | Yes | No | No | No |
| AGENTS.md validation | Yes | No | No | No |
| MCP config validation | Yes | No | No | No |
| Hook script analysis | Yes | No | No | No |
| Cross-file consistency | Yes | No | No | No |
| Secret detection | Yes | No | No | Plugin |
| SARIF output | Yes | No | No | Plugin |
| Dead reference checking | Yes | No | No | No |
| Model name validation | Yes | No | No | No |

agentlint operates at a **different layer** than traditional linters. markdownlint checks Markdown syntax. ESLint checks JavaScript/TypeScript code. agentlint checks **AI agent configuration semantics** -- references that don't resolve, permissions that conflict, secrets that shouldn't be in config files, and tools that aren't registered.

## Security

agentlint detects:
- **API keys and tokens** (OpenAI, Anthropic, GitHub, AWS, Slack, etc.)
- **Dangerous shell patterns** (rm -rf /, curl | bash, eval, fork bombs)
- **Shell injection vulnerabilities** (unsanitized variable interpolation)
- **Overly broad permissions** (wildcard tool access)
- **Private keys** (RSA, EC, embedded in configs)
- **Database credentials** (connection strings with passwords)

## 305 tests across 14 test suites

Test coverage includes parser tests, rule tests for all 5 categories, formatter tests, engine integration tests, edge cases, and documentation drift detection.

## License

MIT License. Copyright (c) 2026 JSLEEKR.
