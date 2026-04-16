/**
 * Rule registry — all built-in rules.
 */

import type { Rule } from "../types.js";
import { structRules } from "./struct-rules.js";
import { refRules } from "./ref-rules.js";
import { secRules } from "./sec-rules.js";
import { conRules } from "./con-rules.js";
import { styleRules } from "./style-rules.js";

/** All built-in rules */
export const allRules: Rule[] = [
  ...structRules,
  ...refRules,
  ...secRules,
  ...conRules,
  ...styleRules,
];

/** Get a rule by its ID */
export function getRule(id: string): Rule | undefined {
  return allRules.find((r) => r.meta.id === id);
}

/** Get all rules in a category */
export function getRulesByCategory(category: string): Rule[] {
  return allRules.filter((r) => r.meta.category === category);
}

/** Get all rule IDs */
export function getRuleIds(): string[] {
  return allRules.map((r) => r.meta.id);
}

export { structRules } from "./struct-rules.js";
export { refRules } from "./ref-rules.js";
export { secRules } from "./sec-rules.js";
export { conRules } from "./con-rules.js";
export { styleRules } from "./style-rules.js";
