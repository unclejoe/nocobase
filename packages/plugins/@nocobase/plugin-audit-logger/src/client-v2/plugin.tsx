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

import type { Application } from '@nocobase/client-v2';
import { Plugin } from '@nocobase/client-v2';

export class PluginAuditLoggerClientV2 extends Plugin<Record<string, never>, Application> {
  async load() {
    const title = this.t('Audit logs') as unknown as string;

    this.pluginSettingsManager.addMenuItem({
      key: 'audit-logger',
      title,
      icon: 'FileTextOutlined',
      aclSnippet: 'pm.audit-logger.logs',
    });

    this.pluginSettingsManager.addPageTabItem({
      menuKey: 'audit-logger',
      key: 'index',
      title,
      componentLoader: () => import('./pages/AuditLogsPage'),
    });
  }
}

export default PluginAuditLoggerClientV2;
