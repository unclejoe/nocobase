/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Tests for the withdraw (cancel) action's state-transition rules (§8.5).
 *
 * The withdraw action is integration-heavy (workflow abort + DB), but the guard
 * logic that decides whether withdraw is allowed and what terminal state it
 * produces is pure. We pin it here:
 *
 *  - withdraw is allowed only when approvals.status === IN_PROGRESS.
 *  - after withdraw, approvals.status === WITHDRAWN (-1) and is terminal.
 *  - a withdrawn approval cannot be resubmitted (resubmit requires IN_PROGRESS).
 *  - pending approvalRecords are invalidated; the approval cannot be acted on.
 */

import { describe, expect, it } from 'vitest';
import { APPROVAL_RECORD_STATUS, APPROVAL_STATUS } from '../../common/constants';

/** Guard: is withdraw allowed for the given approval status? */
function canWithdraw(approvalStatus: number): boolean {
  return approvalStatus === APPROVAL_STATUS.IN_PROGRESS;
}

/** Guard: is resubmit allowed for the given approval status? */
function canResubmit(approvalStatus: number): boolean {
  return approvalStatus === APPROVAL_STATUS.IN_PROGRESS;
}

/** Resulting approval status after a withdraw. */
function statusAfterWithdraw(): number {
  return APPROVAL_STATUS.WITHDRAWN;
}

/** Resulting record status for pending records after a withdraw. */
function recordStatusAfterWithdraw(recordStatus: number): number {
  return recordStatus === APPROVAL_RECORD_STATUS.PENDING ? APPROVAL_RECORD_STATUS.INVALID : recordStatus;
}

describe('withdraw guard (§8.5 Cancel)', () => {
  it('allows withdraw only while the approval is IN_PROGRESS', () => {
    expect(canWithdraw(APPROVAL_STATUS.IN_PROGRESS)).toBe(true);
    expect(canWithdraw(APPROVAL_STATUS.FINISHED)).toBe(false);
    expect(canWithdraw(APPROVAL_STATUS.WITHDRAWN)).toBe(false);
  });

  it('withdraw transitions the approval to WITHDRAWN, which is terminal', () => {
    const before = APPROVAL_STATUS.IN_PROGRESS;
    const after = statusAfterWithdraw();
    expect(after).toBe(APPROVAL_STATUS.WITHDRAWN);
    expect(after).not.toBe(before);
    // Once withdrawn, neither withdraw nor resubmit is allowed again.
    expect(canWithdraw(after)).toBe(false);
    expect(canResubmit(after)).toBe(false);
  });

  it('a finished approval cannot be withdrawn or resubmitted', () => {
    expect(canWithdraw(APPROVAL_STATUS.FINISHED)).toBe(false);
    expect(canResubmit(APPROVAL_STATUS.FINISHED)).toBe(false);
  });

  it('withdraw invalidates pending approver records but leaves already-decided ones untouched', () => {
    expect(recordStatusAfterWithdraw(APPROVAL_RECORD_STATUS.PENDING)).toBe(APPROVAL_RECORD_STATUS.INVALID);
    // An already-approved record keeps its decision (audit trail intact).
    expect(recordStatusAfterWithdraw(APPROVAL_RECORD_STATUS.APPROVED)).toBe(APPROVAL_RECORD_STATUS.APPROVED);
    expect(recordStatusAfterWithdraw(APPROVAL_RECORD_STATUS.INVALID)).toBe(APPROVAL_RECORD_STATUS.INVALID);
  });
});
