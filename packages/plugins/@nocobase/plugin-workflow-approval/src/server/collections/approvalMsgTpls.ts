/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * approvalMsgTpls — notification templates for approval events.
 * type: 'todo' (pending notification) / 'done' (result notification).
 * notificationType: the channel (e.g. 'in-app-message').
 * Visual editing is deferred (phase 3); the table is retained for compatibility.
 */

import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'approvalMsgTpls',
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
      type: 'string',
      name: 'notificationType',
    },
    {
      type: 'string',
      name: 'title',
    },
    // APPROVAL_MSG_TYPE ('todo' | 'done').
    {
      type: 'string',
      name: 'type',
    },
    {
      type: 'json',
      name: 'template',
    },
  ],
});
