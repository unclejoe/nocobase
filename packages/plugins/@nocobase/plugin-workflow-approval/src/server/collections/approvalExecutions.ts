/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * approvalExecutions — one row per approval round within an approval.
 * A return-and-resubmit creates a NEW execution row (status flows
 * null → INTERRUPTED on return, or null → SUCCESS on completion).
 */

import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'approvalExecutions',
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
      name: 'executionId',
    },
    // APPROVAL_EXECUTION_STATUS integer (null = suspended/awaiting).
    {
      type: 'integer',
      name: 'status',
      allowNull: true,
    },
    {
      type: 'jsonb',
      name: 'snapshot',
    },
    {
      type: 'string',
      name: 'reason',
    },
  ],
  indexes: [
    // UNIQUE(approvalId, executionId)
    {
      unique: true,
      fields: ['approvalId', 'executionId'],
      name: 'approvalExecutions_approvalId_executionId_key',
    },
    {
      fields: ['approvalId'],
      name: 'approval_executions_approval_id',
    },
    {
      fields: ['executionId'],
      name: 'approval_executions_execution_id',
    },
  ],
});
