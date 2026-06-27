/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * approvals — the main approval record.
 * One row per approval request submitted against a business record.
 *
 * RelatedApprovals (the association surfacing the 审批 tab on business records)
 * is a polymorphic hasMany scoped on (collectionName + dataKey): a business
 * record (e.g. a quotation) sees all approvals where collectionName matches its
 * table and dataKey equals its id. The association is registered at runtime in
 * Plugin.load() rather than declared here as a static field.
 */

import { defineCollection } from '@nocobase/database';
import { NAMESPACE } from '../../common/constants';

export default defineCollection({
  name: 'approvals',
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
    // The business collection this approval targets (e.g. 'quotations', 'orders').
    {
      type: 'string',
      name: 'collectionName',
    },
    // The id of the business record being approved (polymorphic FK).
    {
      type: 'string',
      name: 'dataKey',
    },
    {
      type: 'bigInt',
      name: 'workflowId',
    },
    {
      type: 'string',
      name: 'workflowKey',
    },
    {
      type: 'bigInt',
      name: 'latestExecutionId',
    },
    // APPROVAL_STATUS integer.
    {
      type: 'integer',
      name: 'status',
    },
    // Full snapshot of the business record at submission time (with associations).
    {
      type: 'json',
      name: 'data',
      defaultValue: {},
    },
    // Role name of the applicant at submission time.
    {
      type: 'string',
      name: 'applicantRoleName',
    },
    // The submit action configuration (trigger context).
    {
      type: 'jsonb',
      name: 'action',
      defaultValue: {},
    },
    {
      type: 'belongsTo',
      name: 'createdBy',
      target: 'users',
      targetKey: 'id',
      foreignKey: 'createdById',
    },
    {
      type: 'belongsTo',
      name: 'updatedBy',
      target: 'users',
      targetKey: 'id',
      foreignKey: 'updatedById',
    },
  ],
});
