/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import path from 'path';
import { Plugin } from '@nocobase/server';
import { AUDITED_ACTIONS, CONFIG_COLLECTION_NAME, COLLECTION_NAME } from '../constants';
import { AuditTrailLogger } from './AuditLogger';

export class PluginAuditLoggerServer extends Plugin {
  // Names of the business collections this plugin has currently registered for
  // auditing. Tracked so a config change can clear *only* our registrations
  // without touching entries other plugins registered (auth/pm/app/uiSchemas/
  // flowModels/...). AuditManager has no unregister API and its `resources`
  // Map is public, so we mutate it directly.
  private registeredCollections = new Set<string>();

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

    // Expose the per-collection audit config as a resource admins can edit.
    // create/destroy cover the add/remove toggle flows from the config UI;
    // there is no update because a toggle is modelled as create-or-destroy of
    // a (collection, action) row. list lets the UI read the current selection.
    this.app.resourceManager.define({
      name: CONFIG_COLLECTION_NAME,
      only: ['list', 'create', 'destroy'],
    });
    this.app.acl.registerSnippet({
      name: ['pm', this.name, 'config'].join('.'),
      actions: [
        `${CONFIG_COLLECTION_NAME}:list`,
        `${CONFIG_COLLECTION_NAME}:create`,
        `${CONFIG_COLLECTION_NAME}:destroy`,
      ],
    });
  }

  async load() {
    await this.importCollections(path.resolve(__dirname, 'collections'));

    // Wire the persistence logger into the core collection framework. This is
    // the only integration point: app.auditManager already runs its middleware
    // and invokes logger.log(auditLog) for every registered action.
    this.app.auditManager.setLogger(new AuditTrailLogger(this.app.db));

    // Seed the audit registration set from the config table, then keep it in
    // sync as admins toggle collections. Hot-reload mirrors token-policy's
    // afterSave pattern; getAction() is consulted on every request, so changes
    // take effect immediately without a restart. The initial sync is deferred
    // to afterStart because the config table may not exist yet during load()
    // (collection tables are synced to the DB as part of the app start cycle,
    // not at importCollections time) — syncAuditRegistrations() is defensive
    // about that and will no-op until the table is ready.
    this.app.db.on(`${CONFIG_COLLECTION_NAME}.afterSave`, async () => {
      await this.syncAuditRegistrations();
    });
    this.app.db.on(`${CONFIG_COLLECTION_NAME}.afterDestroy`, async () => {
      await this.syncAuditRegistrations();
    });
    this.app.on('afterStart', async () => {
      await this.syncAuditRegistrations();
    });
  }

  // Rebuild the business-collection portion of the audit registration set from
  // the config table. Clears only entries this plugin previously registered
  // (tracked in `registeredCollections`), leaving other plugins' registrations
  // intact, then re-registers each configured `<collection>:<action>`.
  private async syncAuditRegistrations(): Promise<void> {
    const auditManager = this.app.auditManager;
    const repo = this.app.db.getRepository(CONFIG_COLLECTION_NAME);

    // Clear our previously registered entries. AuditManager has no unregister
    // API, so we reach into the public `resources` Map directly. We only ever
    // register real `<collection>:<action>` pairs (never bare global names and
    // never `__default__`), so we delete the inner action keys then drop empty
    // resource maps.
    for (const collectionName of this.registeredCollections) {
      const inner = auditManager.resources.get(collectionName);
      if (inner) {
        for (const actionName of AUDITED_ACTIONS) {
          inner.delete(actionName);
        }
        if (inner.size === 0) {
          auditManager.resources.delete(collectionName);
        }
      }
    }
    this.registeredCollections.clear();

    if (!repo) {
      return;
    }

    let rows: { collection: string; action: string }[];
    try {
      rows = (await repo.find()) as unknown as { collection: string; action: string }[];
    } catch (err) {
      // The config table may not exist yet during the very first boot (before
      // the collection is synced to the DB). No-op here; once the table exists
      // the afterStart / afterSave hooks re-run this and populate registrations.
      this.app.log?.warn?.('auditLoggerConfig table not ready, skipping audit sync', {
        module: 'audit-logger',
        err: (err as Error)?.message,
      });
      return;
    }
    for (const row of rows) {
      const action = AUDITED_ACTIONS.find((a) => a === row.action);
      if (!action) {
        continue;
      }
      // Register explicitly as `<collection>:<action>` — never as a bare name
      // — so the global fallback in getAction() never sweeps up system
      // resources (roles/users/applicationPlugins/...).
      auditManager.registerAction(`${row.collection}:${action}`);
      this.registeredCollections.add(row.collection);
    }
  }
}

export default PluginAuditLoggerServer;
