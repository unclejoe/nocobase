/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Tests for computeFieldDiff (§4.2) — the field-level diff between two
 * business-record snapshots, persisted onto approvalRecords.changes on resubmit.
 */

import { describe, expect, it } from 'vitest';
import { computeFieldDiff } from '../computeFieldDiff';

describe('computeFieldDiff', () => {
  it('returns no changes for identical snapshots', () => {
    const snap = { name: 'Quote', amount: 100 };
    expect(computeFieldDiff(snap, snap)).toEqual([]);
  });

  it('detects a changed scalar field', () => {
    const changes = computeFieldDiff({ amount: 100 }, { amount: 150 });
    expect(changes).toEqual([{ field: 'amount', before: 100, after: 150 }]);
  });

  it('detects a newly added field (before absent)', () => {
    const changes = computeFieldDiff({ name: 'Q' }, { name: 'Q', discount: 0.1 });
    expect(changes).toEqual([{ field: 'discount', before: null, after: 0.1 }]);
  });

  it('detects a removed field (after absent)', () => {
    const changes = computeFieldDiff({ name: 'Q', note: 'x' }, { name: 'Q' });
    expect(changes).toEqual([{ field: 'note', before: 'x', after: null }]);
  });

  it('strips audit/technical columns from the diff', () => {
    const before = { name: 'Q', amount: 100, updatedAt: '2026-01-01', updatedById: 5, createdAt: '2026-01-01' };
    const after = { name: 'Q', amount: 100, updatedAt: '2026-06-28', updatedById: 9, createdAt: '2026-01-01' };
    // Only audit fields changed → no business diff.
    expect(computeFieldDiff(before, after)).toEqual([]);
  });

  it('compares nested objects by value', () => {
    const before = { customer: { id: 1, name: 'A' }, amount: 100 };
    const after = { customer: { id: 1, name: 'B' }, amount: 100 };
    expect(computeFieldDiff(before, after)).toEqual([
      { field: 'customer', before: { id: 1, name: 'A' }, after: { id: 1, name: 'B' } },
    ]);
  });

  it('treats equal nested objects as unchanged', () => {
    const before = { customer: { id: 1, name: 'A' } };
    const after = { customer: { id: 1, name: 'A' } };
    expect(computeFieldDiff(before, after)).toEqual([]);
  });

  it('handles null/undefined inputs gracefully', () => {
    expect(computeFieldDiff(null, null)).toEqual([]);
    expect(computeFieldDiff(undefined, { a: 1 })).toEqual([{ field: 'a', before: null, after: 1 }]);
    expect(computeFieldDiff({ a: 1 }, undefined)).toEqual([{ field: 'a', before: 1, after: null }]);
  });
});
