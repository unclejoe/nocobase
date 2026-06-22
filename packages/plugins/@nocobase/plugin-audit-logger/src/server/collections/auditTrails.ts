/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co, Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineCollection } from '@nocobase/database';

export default defineCollection({
  // Audit trails are operational logs, not business data: exclude from
  // user-data dumps and skip on migrate (schema-only).
  dumpRules: {
    group: 'log',
  },
  migrationRules: ['schema-only', 'skip'],
  name: 'auditTrails',
  // Trails are system-generated; never attribute them to the acting user as
  // creator/updater, and do not auto-track updatedAt.
  createdBy: false,
  updatedBy: false,
  updatedAt: false,
  shared: true,
  fields: [
    {
      type: 'string',
      name: 'uuid',
      index: true,
    },
    {
      type: 'string',
      name: 'dataSource',
    },
    {
      type: 'string',
      name: 'resource',
      index: true,
    },
    {
      type: 'string',
      name: 'action',
      index: true,
    },
    {
      type: 'string',
      name: 'requestSource',
    },
    {
      type: 'string',
      name: 'sourceCollection',
    },
    {
      type: 'string',
      name: 'sourceRecordUK',
    },
    {
      type: 'string',
      name: 'targetCollection',
    },
    {
      type: 'string',
      name: 'targetRecordUK',
    },
    {
      type: 'string',
      name: 'userId',
      index: true,
    },
    {
      type: 'string',
      name: 'roleName',
    },
    {
      type: 'string',
      name: 'ip',
    },
    {
      type: 'text',
      name: 'ua',
    },
    {
      type: 'integer',
      name: 'status',
    },
    {
      type: 'json',
      name: 'metadata',
    },
    {
      type: 'date',
      name: 'createdAt',
    },
  ],
});
