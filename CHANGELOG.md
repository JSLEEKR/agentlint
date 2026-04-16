# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-04-16

### Added

- Initial release of agentlint
- 20 built-in rules across 5 categories (struct, ref, sec, con, style)
- Support for 11 agent config file formats (CLAUDE.md, AGENTS.md, SOUL.md, .cursorrules, .claude.json, settings.json, mcp.json, hook scripts)
- 3 output formats: text (human-readable), JSON (structured), SARIF (GitHub Code Scanning)
- Auto-fix support for fixable rules (--fix flag)
- Configuration via .agentlintrc.json with extends, overrides, and per-file settings
- CLI commands: lint, rules, init
- Programmatic API for custom integrations
- 294 tests across 14 test suites
- Cross-file consistency checking (CLAUDE.md <-> MCP config, settings <-> hooks)
- Security rule suite: secret detection, dangerous shell patterns, shell injection, broad permissions
- Known model validation with typo suggestions (Claude, GPT, Gemini)
- Dead reference detection for file paths and MCP server names
- Documentation drift prevention (test count verified against README)
