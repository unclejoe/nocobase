/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Variable tree shape consumed by the workflow variable picker. `value` is the
// bare key name at each level — the `$context` picker composes the dotted path
// (e.g. `data.order.id`) by joining ancestors, matching the convention in
// `getCollectionFieldOptions` (plugin-workflow/src/client/variable.tsx).
export type VariableOption = {
  key?: string;
  value: string;
  label: string;
  children?: VariableOption[] | null;
  isLeaf?: boolean;
};

// Parse a request-body JSON sample into a nested variable tree rooted at the
// sample's keys. Nested plain objects recurse; arrays are represented as a
// single `[items]` node whose children come from the first element (most
// webhooks send homogeneous arrays); primitive leaves are selectable.
//
// The recursion logic mirrors `getObjPaths` in
// `plugin-workflow-json-variable-mapping/src/client/parseActions.tsx` (the same
// parser the official webhook trigger uses), but emits a `{label,value,children}`
// tree directly instead of a flat path list. Copied locally so this plugin does
// not hard-depend on json-variable-mapping being enabled.
export function jsonToVariableOptions(sample: unknown): VariableOption[] {
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
    return [];
  }
  return buildChildren(sample as Record<string, unknown>);
}

function buildChildren(obj: Record<string, unknown>): VariableOption[] {
  return Object.keys(obj).map((key) => toOption(key, obj[key]));
}

function toOption(key: string, value: unknown): VariableOption {
  // Nested object → expandable branch.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      value: key,
      label: key,
      isLeaf: false,
      children: buildChildren(value as Record<string, unknown>),
    };
  }

  // Array → homogeneous-element branch (use first element if it's an object).
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item === 'object' && !Array.isArray(item));
    return {
      value: key,
      label: `${key}[]`,
      isLeaf: false,
      children: first ? buildChildren(first as Record<string, unknown>) : null,
    };
  }

  // Primitive → selectable leaf.
  return { value: key, label: key, isLeaf: true };
}
