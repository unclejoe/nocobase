/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineCollection } from '@nocobase/database';

// Per-collection audit configuration. Each row means "audit <collection>'s
// <action>". An empty table audits no business collections (the default). The
// server plugin rebuilds the auditManager registration set from these rows
// (on load and whenever they change), registering explicit
// `<collection>:<action>` entries — never bare global names — so system
// resources are never swept up by AuditManager.getAction()'s global fallback.
export default defineCollection({
  name: 'auditLoggerConfig',
  // Config is system data: it must travel with snapshots/dumps.
  dumpRules: 'required',
  migrationRules: ['overwrite', 'schema-only'],
  fields: [
    {
      type: 'string',
      name: 'collection',
      allowNull: false,
    },
    {
      type: 'string',
      name: 'action',
      allowNull: false,
    },
  ],
  indexes: [
    {
      unique: true,
      fields: ['collection', 'action'],
    },
  ],
});
