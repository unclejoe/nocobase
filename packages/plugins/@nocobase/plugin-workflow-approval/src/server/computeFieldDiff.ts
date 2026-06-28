/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Field-level diff between two business-record snapshots (§4.2).
 *
 * Used at the resubmit boundary: the applicant edits the business record and
 * resubmits; we compare the previous `approvals.data` snapshot against the new
 * one and persist only the changed fields onto the new round's
 * `approvalRecords.changes`, so approvers see exactly what was modified.
 *
 * Shallow comparison with JSON.stringify value equality (handles nested objects
 * and arrays). Audit/technical columns are stripped to avoid noise.
 */

/** A single field that differs between the two snapshots. */
export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** Audit/technical columns excluded from the diff (business-irrelevant noise). */
const IGNORED_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'createdById',
  'updatedById',
  'createdBy',
  'updatedBy',
  '__collectionName',
  '__type',
]);

/**
 * Compare two snapshots and return the fields whose values differ.
 * Returns an empty array when the snapshots are equivalent.
 */
export function computeFieldDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): FieldChange[] {
  const safeBefore = before && typeof before === 'object' ? (before as Record<string, unknown>) : {};
  const safeAfter = after && typeof after === 'object' ? (after as Record<string, unknown>) : {};
  const keys = new Set([...Object.keys(safeBefore), ...Object.keys(safeAfter)]);
  const changes: FieldChange[] = [];
  for (const field of keys) {
    if (IGNORED_FIELDS.has(field)) {
      continue;
    }
    const b = safeBefore[field];
    const a = safeAfter[field];
    if (!jsonEqual(b, a)) {
      changes.push({ field, before: b ?? null, after: a ?? null });
    }
  }
  return changes;
}

/** Structural equality via JSON serialization (order-tolerant for primitives). */
function jsonEqual(a: unknown, b: unknown): boolean {
  // Fast path for identical primitives / references.
  if (a === b) {
    return true;
  }
  // Treat null/undefined as equal (absence on either side).
  if (a == null && b == null) {
    return true;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
