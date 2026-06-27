/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * approvalAudienceUsers — materialized user list expanded from approvalAudiences.
 * One row per (workflow, user) who can view that workflow's approvals.
 */

import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'approvalAudienceUsers',
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
      type: 'belongsTo',
      name: 'user',
      target: 'users',
      targetKey: 'id',
      foreignKey: 'userId',
    },
  ],
  indexes: [
    {
      unique: true,
      fields: ['workflowId', 'userId'],
      name: 'approval_audience_users_workflow_id_user_id',
    },
    {
      fields: ['userId'],
      name: 'approval_audience_users_user_id',
    },
  ],
});
