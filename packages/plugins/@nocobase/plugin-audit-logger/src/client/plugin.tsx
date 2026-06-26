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

import { Plugin, lazy } from '@nocobase/client';
import { NAMESPACE } from '../constants';

const { AuditLogsConfiguration } = lazy(() => import('./Configuration'), 'AuditLogsConfiguration');

export class PluginAuditLoggerClient extends Plugin {
  async load() {
    this.pluginSettingsManager.add('audit-logger', {
      icon: 'FileTextOutlined',
      title: `{{t("Audit logs", { ns: "${NAMESPACE}" })}}`,
      Component: AuditLogsConfiguration,
      aclSnippet: 'pm.audit-logger.logs',
    });
  }
}

export default PluginAuditLoggerClient;
