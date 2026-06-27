/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * approvalAudiences — who can SEE a workflow's approvals (scope config).
 * Type identifies the audience kind (role/department/...), targetKey the id.
 * UI for editing this is deferred (phase 3); the table is retained for
 * compatibility.
 */

import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'approvalAudiences',
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
      type: 'bigInt',
      name: 'workflowId',
    },
    {
      type: 'string',
      name: 'type',
      allowNull: false,
    },
    {
      type: 'string',
      name: 'targetKey',
      allowNull: false,
    },
  ],
  indexes: [
    {
      unique: true,
      fields: ['workflowId', 'type', 'targetKey'],
      name: 'approval_audiences_workflow_id_type_target_key',
    },
  ],
});
