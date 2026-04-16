# Round 83 — agentlint

- **Project**: agentlint
- **Category**: AI Agent Config Validation / Static Analysis
- **Language**: TypeScript
- **Date**: 2026-04-16
- **Build status**: New build
- **Quality gate status**: Pending evaluation

## Build Summary

- Source lines: 3,156
- Total lines (incl. tests): 6,374
- Test count: 297
- Test suites: 14
- Rules: 20 (4 struct, 4 ref, 4 sec, 4 con, 4 style)
- Supported file formats: 11
- Output formats: 3 (text, JSON, SARIF)
- CLI commands: 3 (lint, rules, init)

## Files Created

- `src/types.ts` — Core types, constants (KNOWN_MODELS, SECRET_PATTERNS, DANGEROUS_SHELL_PATTERNS)
- `src/cli.ts` — CLI entry point (commander-based)
- `src/engine.ts` — Lint engine (scan, execute rules, collect results, apply fixes)
- `src/config.ts` — Configuration loader and merger
- `src/scanner.ts` — File scanner and classifier
- `src/index.ts` — Public API
- `src/parsers/markdown.ts` — Markdown parser (frontmatter, headings, code blocks, links, references)
- `src/parsers/json-parser.ts` — JSON parser with line-level error reporting
- `src/parsers/yaml-parser.ts` — YAML parser wrapping js-yaml
- `src/rules/struct-rules.ts` — 4 structural rules
- `src/rules/ref-rules.ts` — 4 reference rules
- `src/rules/sec-rules.ts` — 4 security rules
- `src/rules/con-rules.ts` — 4 consistency rules
- `src/rules/style-rules.ts` — 4 style rules
- `src/formatters/text.ts` — Human-readable colored terminal output
- `src/formatters/json-formatter.ts` — JSON structured output
- `src/formatters/sarif.ts` — SARIF 2.1.0 output
- `src/__tests__/*.test.ts` — 14 test files, 294 tests
- `README.md` — 368 lines, for-the-badge badges
- `CHANGELOG.md`
- `LICENSE` — MIT 2026 JSLEEKR
- `package.json`, `tsconfig.json`, `vitest.config.ts`
