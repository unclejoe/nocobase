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

import path from 'path';
import { Plugin } from '@nocobase/server';
import { COLLECTION_NAME } from '../constants';
import { AuditTrailLogger } from './AuditLogger';

export class PluginAuditLoggerServer extends Plugin {
  async beforeLoad() {
    // Expose auditTrails as a READ-ONLY resource. Only list/get are wired so
    // trails can never be created/modified/deleted through the HTTP API.
    this.app.resourceManager.define({
      name: COLLECTION_NAME,
      only: ['list', 'get'],
    });

    // Gate the read-only actions behind a plugin-manager ACL snippet; the root
    // role is granted every snippet by default, other roles opt in explicitly.
    this.app.acl.registerSnippet({
      name: ['pm', this.name, 'logs'].join('.'),
      actions: [`${COLLECTION_NAME}:list`, `${COLLECTION_NAME}:get`],
    });
  }

  async load() {
    await this.importCollections(path.resolve(__dirname, 'collections'));

    // Wire the persistence logger into the core collection framework. This is
    // the only integration point: app.auditManager already runs its middleware
    // and invokes logger.log(auditLog) for every registered action.
    this.app.auditManager.setLogger(new AuditTrailLogger(this.app.db));
  }
}

export default PluginAuditLoggerServer;
