/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Open-source reimplementation of the commercial workflow-approval plugin.
 * Copyright (c) 2026 DAN.AI. Licensed under AGPL-3.0.
 *
 * Status enums below are REVERSE-ENGINEERED from existing production data rows
 * (the commercial source is unavailable). Integer values MUST be preserved so
 * historical records display correctly. Semantic labels were inferred from the
 * data distribution and should be validated against live UI behaviour.
 */

export const NAMESPACE = '@nocobase/plugin-workflow-approval';

export const TRIGGER_TYPE = 'approval';
export const INSTRUCTION_TYPE = 'approval';
export const TASK_TYPE_APPROVAL = 'approval';

/** Collection names — must match the existing DB tables exactly. */
export const APPROVAL_COLLECTION = 'approvals';
export const APPROVAL_RECORD_COLLECTION = 'approvalRecords';
export const APPROVAL_EXECUTION_COLLECTION = 'approvalExecutions';
export const APPROVAL_AUDIENCE_COLLECTION = 'approvalAudiences';
export const APPROVAL_AUDIENCE_USER_COLLECTION = 'approvalAudienceUsers';
export const APPROVAL_MSG_TPL_COLLECTION = 'approvalMsgTpls';

/**
 * approvals.status — overall approval lifecycle.
 * Reverse-engineered: observed values {-1, 1, 2} in production.
 */
export const APPROVAL_STATUS = {
  /** Withdrawn / cancelled by applicant. (observed: -1) */
  WITHDRAWN: -1,
  /** In progress, awaiting approvers. (observed: 1) */
  IN_PROGRESS: 1,
  /** Finished (approved or rejected). (observed: 2) */
  FINISHED: 2,
} as const;

/**
 * approvalRecords.status — per-approver record state.
 * Reverse-engineered: observed values {-1, 0, 1, 3} in production.
 */
export const APPROVAL_RECORD_STATUS = {
  /** Invalidated (e.g. superseded by a new round after return). (observed: -1) */
  INVALID: -1,
  /** Pending — waiting for this approver to act. (observed: 0) */
  PENDING: 0,
  /** Approved / passed by this approver. (observed: 1) */
  APPROVED: 1,
  /** Read / notified (record was generated for notification). (observed: 3) */
  NOTIFIED: 3,
} as const;

/**
 * approvalExecutions.status — per-execution (one round) state.
 * Reverse-engineered: observed values {null, -6, 1} in production.
 * null is the "suspended, awaiting approvers" state.
 */
export const APPROVAL_EXECUTION_STATUS = {
  /** Interrupted (e.g. returned / rejected, execution ended early). (observed: -6) */
  INTERRUPTED: -6,
  /** Successfully completed this round. (observed: 1) */
  SUCCESS: 1,
} as const;

/**
 * approvalRecords.type — record classification.
 * Reverse-engineered: observed value "Normal" in production.
 */
export const APPROVAL_RECORD_TYPE = {
  NORMAL: 'Normal',
} as const;

/** Approver source kinds for the ApproverResolver. */
export const APPROVER_SOURCE = {
  /** Directly specified user ids. */
  USER: 'user',
  /** All users with a given role. */
  ROLE: 'role',
  /** All users in a given department (optionally only main members). */
  DEPARTMENT: 'department',
  /** The owner (isOwner=true) of the applicant's main department — direct supervisor. */
  SUPERVISOR: 'supervisor',
} as const;

/** Multiple-approver resolution modes (mirrors workflow-manual semantics). */
export const APPROVAL_MODE = {
  /** Single approver only (first configured). */
  SINGLE: 0,
  /** Countersign: ALL must approve before continuing. */
  ALL: 1,
  /** Or-sign: ANY one approval continues; ALL must reject to reject. */
  ANY: -1,
} as const;

/** approvalMsgTpls.type values (observed: 'todo', 'done'). */
export const APPROVAL_MSG_TYPE = {
  TODO: 'todo',
  DONE: 'done',
} as const;
