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

export const NAMESPACE = '@nocobase/plugin-audit-logger';

export const COLLECTION_NAME = 'auditTrails';

// Per-collection audit configuration. Each row records that `<collection>`'s
// `<action>` should be audited. An empty table audits no business collections
// (matching the default before any config is applied).
export const CONFIG_COLLECTION_NAME = 'auditLoggerConfig';

// The business CRUD actions that admins can toggle per collection. These are
// registered as explicit `<collection>:<action>` entries — never as bare
// global names, so system resources (roles/users/applicationPlugins) are never
// swept up by the global fallback in AuditManager.getAction().
export const AUDITED_ACTIONS = ['create', 'update', 'destroy'] as const;

export type AuditedAction = (typeof AUDITED_ACTIONS)[number];

export function generateNTemplate(key: string) {
  return `{{t('${key}', { ns: '${NAMESPACE}', nsMode: 'fallback' })}}`;
}
