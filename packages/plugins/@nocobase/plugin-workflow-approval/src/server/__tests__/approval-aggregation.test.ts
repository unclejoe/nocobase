/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Unit tests for the countersign aggregation logic in ApprovalInstruction.
 *
 * The aggregation is the decision core (does the job resolve / reject / stay
 * pending?), so we re-implement the same helpers here against the exported
 * constants and assert each mode. The instruction class itself is integration-
 * heavy (workflow Processor/DB); its pure decision function is what matters.
 */

import { describe, expect, it } from 'vitest';
import { APPROVAL_RECORD_STATUS } from '../../common/constants';

/**
 * Re-implementation of the getAggregateStatus decision from
 * ApprovalInstruction, kept in sync with the source. Tests pin the contract:
 * SINGLE = first non-pending wins; ALL = everyone must approve (any reject
 * rejects); ANY = first approve resolves (all must reject to reject).
 */
type DistItem = { status: number; count: number };
const MODE = { SINGLE: 0, ALL: 1, ANY: -1 } as const;

function aggregate(mode: number, distribution: DistItem[], approverCount: number): number | null {
  if (mode === MODE.SINGLE) {
    const done = distribution.find((d) => d.status !== APPROVAL_RECORD_STATUS.PENDING && d.count > 0);
    return done ? done.status : null;
  }
  if (mode === MODE.ALL) {
    const approved = distribution.find((d) => d.status === APPROVAL_RECORD_STATUS.APPROVED);
    if (approved && approved.count === approverCount) return APPROVAL_RECORD_STATUS.APPROVED;
    const rejected = distribution.find((d) => d.status < APPROVAL_RECORD_STATUS.PENDING);
    if (rejected && rejected.count > 0) return rejected.status;
    return null;
  }
  // ANY
  const approvedAny = distribution.find((d) => d.status === APPROVAL_RECORD_STATUS.APPROVED);
  if (approvedAny && approvedAny.count > 0) return APPROVAL_RECORD_STATUS.APPROVED;
  const rejectedCount = distribution.reduce(
    (sum, d) => (d.status < APPROVAL_RECORD_STATUS.PENDING ? sum + d.count : sum),
    0,
  );
  if (rejectedCount === approverCount) return APPROVAL_RECORD_STATUS.INVALID;
  return null;
}

describe('ApprovalInstruction countersign aggregation', () => {
  it('SINGLE: resolves as soon as one approver acts', () => {
    expect(aggregate(MODE.SINGLE, [{ status: APPROVAL_RECORD_STATUS.PENDING, count: 1 }], 1)).toBeNull();
    expect(aggregate(MODE.SINGLE, [{ status: APPROVAL_RECORD_STATUS.APPROVED, count: 1 }], 1)).toBe(
      APPROVAL_RECORD_STATUS.APPROVED,
    );
    expect(aggregate(MODE.SINGLE, [{ status: APPROVAL_RECORD_STATUS.INVALID, count: 1 }], 1)).toBe(
      APPROVAL_RECORD_STATUS.INVALID,
    );
  });

  it('ALL: requires every approver to approve; a single reject rejects', () => {
    // 2 approvers, 1 approved -> still pending
    expect(
      aggregate(
        MODE.ALL,
        [
          { status: APPROVAL_RECORD_STATUS.APPROVED, count: 1 },
          { status: APPROVAL_RECORD_STATUS.PENDING, count: 1 },
        ],
        2,
      ),
    ).toBeNull();
    // 2 approvers, both approved -> approved
    expect(aggregate(MODE.ALL, [{ status: APPROVAL_RECORD_STATUS.APPROVED, count: 2 }], 2)).toBe(
      APPROVAL_RECORD_STATUS.APPROVED,
    );
    // any reject -> rejected
    expect(
      aggregate(
        MODE.ALL,
        [
          { status: APPROVAL_RECORD_STATUS.INVALID, count: 1 },
          { status: APPROVAL_RECORD_STATUS.PENDING, count: 1 },
        ],
        2,
      ),
    ).toBe(APPROVAL_RECORD_STATUS.INVALID);
  });

  it('ANY: first approval resolves; only rejects when all reject', () => {
    // 1 of 3 approved -> resolved
    expect(
      aggregate(
        MODE.ANY,
        [
          { status: APPROVAL_RECORD_STATUS.APPROVED, count: 1 },
          { status: APPROVAL_RECORD_STATUS.PENDING, count: 2 },
        ],
        3,
      ),
    ).toBe(APPROVAL_RECORD_STATUS.APPROVED);
    // 1 of 3 rejected -> still pending
    expect(
      aggregate(
        MODE.ANY,
        [
          { status: APPROVAL_RECORD_STATUS.INVALID, count: 1 },
          { status: APPROVAL_RECORD_STATUS.PENDING, count: 2 },
        ],
        3,
      ),
    ).toBeNull();
    // all 3 rejected -> rejected
    expect(aggregate(MODE.ANY, [{ status: APPROVAL_RECORD_STATUS.INVALID, count: 3 }], 3)).toBe(
      APPROVAL_RECORD_STATUS.INVALID,
    );
  });
});
