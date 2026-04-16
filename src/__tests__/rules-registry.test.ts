/**
 * Tests for rule registry.
 */

import { describe, it, expect } from "vitest";
import { allRules, getRule, getRulesByCategory, getRuleIds } from "../rules/index.js";

describe("rule registry", () => {
  it("should have at least 20 rules", () => {
    expect(allRules.length).toBeGreaterThanOrEqual(20);
  });

  it("should have unique rule IDs", () => {
    const ids = allRules.map((r) => r.meta.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("should have all required categories", () => {
    const categories = new Set(allRules.map((r) => r.meta.category));
    expect(categories.has("struct")).toBe(true);
    expect(categories.has("ref")).toBe(true);
    expect(categories.has("sec")).toBe(true);
    expect(categories.has("con")).toBe(true);
    expect(categories.has("style")).toBe(true);
  });

  it("should have struct rules", () => {
    const structRules = getRulesByCategory("struct");
    expect(structRules.length).toBe(4);
  });

  it("should have ref rules", () => {
    const refRules = getRulesByCategory("ref");
    expect(refRules.length).toBe(4);
  });

  it("should have sec rules", () => {
    const secRules = getRulesByCategory("sec");
    expect(secRules.length).toBe(4);
  });

  it("should have con rules", () => {
    const conRules = getRulesByCategory("con");
    expect(conRules.length).toBe(4);
  });

  it("should have style rules", () => {
    const styleRules = getRulesByCategory("style");
    expect(styleRules.length).toBe(4);
  });

  it("should get rule by ID", () => {
    const rule = getRule("struct-json-valid");
    expect(rule).toBeDefined();
    expect(rule?.meta.id).toBe("struct-json-valid");
  });

  it("should return undefined for unknown rule ID", () => {
    expect(getRule("nonexistent-rule")).toBeUndefined();
  });

  it("should list all rule IDs", () => {
    const ids = getRuleIds();
    expect(ids.length).toBe(allRules.length);
    expect(ids).toContain("struct-claude-md-sections");
    expect(ids).toContain("sec-no-secrets-in-config");
  });

  it("should have descriptions for all rules", () => {
    for (const rule of allRules) {
      expect(rule.meta.description).toBeTruthy();
      expect(rule.meta.description.length).toBeGreaterThan(10);
    }
  });

  it("should have valid severity for all rules", () => {
    for (const rule of allRules) {
      expect(["error", "warning", "info"]).toContain(rule.meta.defaultSeverity);
    }
  });

  it("should have appliesTo for all rules", () => {
    for (const rule of allRules) {
      expect(rule.meta.appliesTo.length).toBeGreaterThan(0);
    }
  });

  it("should have check function for all rules", () => {
    for (const rule of allRules) {
      expect(typeof rule.check).toBe("function");
    }
  });

  it("should have correct naming convention for rule IDs", () => {
    for (const rule of allRules) {
      const [category] = rule.meta.id.split("-");
      const validPrefixes = ["struct", "ref", "sec", "con", "style"];
      expect(validPrefixes).toContain(category);
    }
  });

  it("should mark fixable rules correctly", () => {
    const trailingWhitespace = getRule("style-no-trailing-whitespace");
    expect(trailingWhitespace?.meta.fixable).toBe(true);

    const jsonValid = getRule("struct-json-valid");
    expect(jsonValid?.meta.fixable).toBe(false);
  });
});
