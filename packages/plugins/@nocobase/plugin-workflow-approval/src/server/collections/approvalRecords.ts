/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * approvalRecords — one row per approver, per approval round.
 * Tracks who must/has approved, their decision, comment, and forms the audit
 * chain via prevRecordId (a new round after return links to the previous one).
 */

import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'approvalRecords',
  dataCategory: 'business',
  filterTargetKey: 'id',
  simplePaginate: true,
  dumpRules: {
    group: 'log',
  },
  migrationRules: ['schema-only'],
  shared: true,
  fields: [
    {
      type: 'snowflakeId',
      name: 'id',
      primaryKey: true,
      allowNull: false,
    },
    {
      type: 'belongsTo',
      name: 'approval',
      target: 'approvals',
      targetKey: 'id',
      foreignKey: 'approvalId',
    },
    {
      type: 'bigInt',
      name: 'approvalExecutionId',
    },
    {
      type: 'belongsTo',
      name: 'user',
      target: 'users',
      targetKey: 'id',
      foreignKey: 'userId',
    },
    {
      type: 'bigInt',
      name: 'jobId',
    },
    {
      type: 'bigInt',
      name: 'executionId',
    },
    {
      type: 'bigInt',
      name: 'nodeId',
    },
    {
      type: 'bigInt',
      name: 'workflowId',
    },
    // Countersign ordinal within a job (UNIQUE(jobId, index)).
    {
      type: 'integer',
      name: 'index',
    },
    {
      type: 'string',
      name: 'title',
    },
    // APPROVAL_RECORD_STATUS integer.
    {
      type: 'integer',
      name: 'status',
    },
    {
      type: 'text',
      name: 'comment',
    },
    // Target node key when the approver returned the request.
    {
      type: 'string',
      name: 'returnToNodeKey',
    },
    // APPROVAL_RECORD_TYPE string (e.g. 'Normal').
    {
      type: 'string',
      name: 'type',
    },
    // Self-reference: previous round's record (approval chain after a return).
    {
      type: 'bigInt',
      name: 'prevRecordId',
    },
    // Field-level change snapshots for this approval action.
    {
      type: 'json',
      name: 'dataBefore',
    },
    {
      type: 'json',
      name: 'dataAfter',
    },
    {
      type: 'json',
      name: 'changes',
    },
  ],
  // UNIQUE(jobId, index) — a given job's countersign slot is unique.
  indexes: [
    {
      unique: true,
      fields: ['jobId', 'index'],
      name: 'approval_records_job_id_index',
    },
    {
      fields: ['approvalId'],
      name: 'approval_records_approval_id',
    },
    {
      fields: ['approvalExecutionId'],
      name: 'approval_records_approval_execution_id',
    },
    {
      fields: ['executionId'],
      name: 'approval_records_execution_id',
    },
    {
      fields: ['nodeId'],
      name: 'approval_records_node_id',
    },
    {
      fields: ['userId', 'status'],
      name: 'approval_records_user_id_status',
    },
    {
      fields: ['workflowId'],
      name: 'approval_records_workflow_id',
    },
    {
      fields: ['prevRecordId'],
      name: 'approval_records_prev_record_id',
    },
  ],
});
