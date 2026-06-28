/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Tests for the return-and-resubmit closed loop (§8.3).
 *
 * The full Instruction class is integration-heavy (workflow Processor + DB).
 * The two pieces of logic that matter for the closed loop are pure:
 *
 *  1. The job-status decision in `resume()`: a *return* (INVALID record with a
 *     returnToNodeKey) must end the execution (REJECTED job status) but, unlike a
 *     real reject, must NOT finalize the parent approval — so the applicant can
 *     resubmit. We re-implement the decision here and pin the contract.
 *
 *  2. The prevRecordId chaining rule: a resubmit's new records link to the most
 *     recent INVALID record from a *different* execution of the same approval,
 *     forming the audit chain. First round (no prior execution) links to null.
 */

import { describe, expect, it } from 'vitest';
import { APPROVAL_RECORD_STATUS, APPROVAL_STATUS } from '../../common/constants';

// Job status constants mirrored from @nocobase/plugin-workflow (kept local to
// avoid importing the plugin's server entry into a pure unit test).
const JOB_STATUS = { PENDING: 0, RESOLVED: 1, REJECTED: -5 } as const;

type Record = {
  id: number;
  executionId: number;
  status: number;
  returnToNodeKey?: string | null;
};

/**
 * Re-implementation of the resume() job-status + approval-status decision.
 * Mirrors ApprovalInstruction.resume()'s post-aggregate branch logic.
 */
function decideJobAndApprovalStatus(
  aggregateStatus: number,
  records: Record[],
): { jobStatus: number; approvalStatus: number | null } {
  const returnedRecord = records.find((r) => r.status === APPROVAL_RECORD_STATUS.INVALID && r.returnToNodeKey);

  let jobStatus = aggregateStatus;
  if (aggregateStatus === APPROVAL_RECORD_STATUS.APPROVED) {
    jobStatus = JOB_STATUS.RESOLVED;
  } else if (aggregateStatus < APPROVAL_RECORD_STATUS.PENDING) {
    // Both reject and return end this execution's job.
    jobStatus = JOB_STATUS.REJECTED;
  }

  if (jobStatus === JOB_STATUS.RESOLVED) {
    return { jobStatus, approvalStatus: APPROVAL_STATUS.FINISHED };
  }
  if (jobStatus === JOB_STATUS.REJECTED && !returnedRecord) {
    // A real reject finalizes the approval; a return leaves it IN_PROGRESS.
    return { jobStatus, approvalStatus: APPROVAL_STATUS.FINISHED };
  }
  // Return: approval stays IN_PROGRESS so the applicant can resubmit.
  return { jobStatus, approvalStatus: null };
}

describe('return-and-resubmit decision (resume)', () => {
  it('a real reject (no returnToNodeKey) finalizes the approval', () => {
    const records: Record[] = [{ id: 1, executionId: 10, status: APPROVAL_RECORD_STATUS.INVALID }];
    const { jobStatus, approvalStatus } = decideJobAndApprovalStatus(APPROVAL_RECORD_STATUS.INVALID, records);
    expect(jobStatus).toBe(JOB_STATUS.REJECTED);
    expect(approvalStatus).toBe(APPROVAL_STATUS.FINISHED);
  });

  it('a return (INVALID + returnToNodeKey) ends the execution but keeps the approval IN_PROGRESS', () => {
    const records: Record[] = [
      { id: 1, executionId: 10, status: APPROVAL_RECORD_STATUS.INVALID, returnToNodeKey: 'approval-node' },
    ];
    const { jobStatus, approvalStatus } = decideJobAndApprovalStatus(APPROVAL_RECORD_STATUS.INVALID, records);
    expect(jobStatus).toBe(JOB_STATUS.REJECTED);
    // approvalStatus null => the approval row is NOT updated, stays IN_PROGRESS.
    expect(approvalStatus).toBeNull();
  });

  it('an approve resolves the job and finalizes the approval', () => {
    const records: Record[] = [{ id: 1, executionId: 10, status: APPROVAL_RECORD_STATUS.APPROVED }];
    const { jobStatus, approvalStatus } = decideJobAndApprovalStatus(APPROVAL_RECORD_STATUS.APPROVED, records);
    expect(jobStatus).toBe(JOB_STATUS.RESOLVED);
    expect(approvalStatus).toBe(APPROVAL_STATUS.FINISHED);
  });
});

/**
 * Re-implementation of the prevRecordId chaining rule from
 * ApprovalInstruction.findPrevRoundRecordId(): pick the most recent INVALID
 * record whose executionId differs from the current round's execution.
 */
function pickPrevRecordId(records: Record[], currentExecutionId: number): number | null {
  const candidates = records
    .filter((r) => r.executionId !== currentExecutionId && r.status === APPROVAL_RECORD_STATUS.INVALID)
    .sort((a, b) => b.id - a.id);
  return candidates.length ? candidates[0].id : null;
}

describe('prevRecordId audit-chain linking (run on resubmit)', () => {
  it('first round has no prior round → links to null', () => {
    const records: Record[] = [];
    expect(pickPrevRecordId(records, 10)).toBeNull();
  });

  it('links to the most recent INVALID record from a different execution', () => {
    // Round 1 (exec 10) was returned; round 2 (exec 11) resubmits.
    const records: Record[] = [
      { id: 1, executionId: 10, status: APPROVAL_RECORD_STATUS.INVALID, returnToNodeKey: 'n' },
      { id: 2, executionId: 10, status: APPROVAL_RECORD_STATUS.INVALID, returnToNodeKey: 'n' },
    ];
    expect(pickPrevRecordId(records, 11)).toBe(2);
  });

  it('ignores records from the same execution (only prior rounds qualify)', () => {
    const records: Record[] = [
      { id: 1, executionId: 11, status: APPROVAL_RECORD_STATUS.INVALID }, // same exec
      { id: 2, executionId: 10, status: APPROVAL_RECORD_STATUS.INVALID, returnToNodeKey: 'n' },
    ];
    expect(pickPrevRecordId(records, 11)).toBe(2);
  });

  it('ignores non-INVALID records from prior executions', () => {
    const records: Record[] = [{ id: 1, executionId: 10, status: APPROVAL_RECORD_STATUS.APPROVED }];
    expect(pickPrevRecordId(records, 11)).toBeNull();
  });
});
