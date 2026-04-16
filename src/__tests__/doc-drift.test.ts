/**
 * Documentation drift prevention test.
 * Verifies that the test count in README matches the actual test count.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

describe("documentation drift", () => {
  it("should have README badge test count matching actual test count", () => {
    const readmePath = path.resolve(import.meta.dirname, "../../README.md");
    if (!fs.existsSync(readmePath)) return; // Skip if README not yet created
    const readme = fs.readFileSync(readmePath, { encoding: "utf-8" });

    // Extract test count from badge: ![tests](https://img.shields.io/badge/tests-NNN-...)
    const badgeMatch = readme.match(/badge\/tests-(\d+)-/);
    if (!badgeMatch) {
      // If no badge found, skip (build might not have added it yet)
      return;
    }

    const badgeCount = parseInt(badgeMatch[1], 10);

    // Count actual tests using vitest list
    const projectRoot = path.resolve(import.meta.dirname, "../..");
    let actualCount: number;
    try {
      const result = execSync("npx vitest list 2>/dev/null | wc -l", {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 30000,
      });
      actualCount = parseInt(result.trim(), 10);
    } catch {
      // If vitest list fails, try counting test names from our test files
      const testFiles = fs.readdirSync(path.resolve(import.meta.dirname)).filter(
        (f) => f.endsWith(".test.ts")
      );
      actualCount = 0;
      for (const file of testFiles) {
        const content = fs.readFileSync(
          path.resolve(import.meta.dirname, file),
          { encoding: "utf-8" }
        );
        const matches = content.match(/\bit\(/g);
        actualCount += matches ? matches.length : 0;
      }
    }

    if (!isNaN(actualCount) && actualCount > 0) {
      expect(badgeCount).toBe(actualCount);
    }
  });

  it("should have README sentence test count matching actual test count", () => {
    const readmePath = path.resolve(import.meta.dirname, "../../README.md");
    if (!fs.existsSync(readmePath)) return; // Skip if README not yet created
    const readme = fs.readFileSync(readmePath, { encoding: "utf-8" });

    // Extract test count from sentence like "NNN tests" or "NNN+ tests"
    const sentenceMatch = readme.match(/\b(\d+)\+?\s+tests\b/);
    if (!sentenceMatch) {
      return;
    }

    const sentenceCount = parseInt(sentenceMatch[1], 10);

    // Count test cases from test files
    const testDir = path.resolve(import.meta.dirname);
    const testFiles = fs.readdirSync(testDir).filter((f) => f.endsWith(".test.ts"));
    let actualCount = 0;
    for (const file of testFiles) {
      const content = fs.readFileSync(path.resolve(testDir, file), { encoding: "utf-8" });
      const matches = content.match(/\bit\(/g);
      actualCount += matches ? matches.length : 0;
    }

    if (actualCount > 0) {
      expect(sentenceCount).toBe(actualCount);
    }
  });
});
