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

import type { AuditLog, AuditLogger as IAuditLogger } from '@nocobase/server';
import type { Database } from '@nocobase/database';
import { COLLECTION_NAME } from '../constants';

/**
 * Persists AuditLog records produced by app.auditManager into the `auditTrails`
 * collection. This is the persistence half of the request-level audit pipeline:
 *
 *   app.auditManager.middleware  ->  AuditManager.output  ->  AuditLogger.log  ->  auditTrails row
 *
 * Logging failures must never break the audited request: errors are swallowed
 * and reported through the application logger so the response cycle is unaffected.
 */
export class AuditTrailLogger implements IAuditLogger {
  constructor(private db: Database) {}

  async log(auditLog: AuditLog): Promise<void> {
    try {
      const repo = this.db.getRepository(COLLECTION_NAME);
      if (!repo) {
        return;
      }
      await repo.create({
        values: {
          uuid: auditLog.uuid,
          dataSource: auditLog.dataSource,
          resource: auditLog.resource,
          action: auditLog.action,
          requestSource: auditLog.requestSource,
          sourceCollection: auditLog.sourceCollection,
          sourceRecordUK: auditLog.sourceRecordUK,
          targetCollection: auditLog.targetCollection,
          targetRecordUK: auditLog.targetRecordUK,
          userId: auditLog.userId != null ? String(auditLog.userId) : null,
          roleName: auditLog.roleName,
          ip: auditLog.ip,
          ua: auditLog.ua,
          status: auditLog.status,
          metadata: auditLog.metadata,
        },
      });
    } catch (err) {
      // The audit middleware runs in the response's `finally` block; rethrowing
      // here would corrupt the response. Surface the failure via the db logger.
      this.db.logger?.error?.((err as Error)?.message || 'audit trail persist failed', {
        module: 'audit-logger',
        uuid: auditLog.uuid,
      });
    }
  }
}
