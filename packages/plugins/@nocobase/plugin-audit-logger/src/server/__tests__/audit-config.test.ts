/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createMockServer, MockServer } from '@nocobase/test';
import type { Application } from '@nocobase/server';
import { CONFIG_COLLECTION_NAME } from '../../constants';

// Verifies the per-collection audit configuration feature: an admin picks
// which business collections/actions are audited via the auditLoggerConfig
// table, and the plugin rebuilds the auditManager registration set on every
// change. Business CRUD is NOT audited unless configured; system actions
// (auth) are always audited and never affected by config toggles.
describe('audit-logger per-collection config', () => {
  let app: MockServer;

  afterEach(async () => {
    if (app) {
      await app.destroy();
    }
  });

  async function createApp() {
    process.env.INIT_ROOT_EMAIL = 'admin@nocobase.com';
    process.env.INIT_ROOT_PASSWORD = 'admin123';
    process.env.INIT_ROOT_NICKNAME = 'Admin';
    app = await createMockServer({
      plugins: [
        'field-sort',
        'auth',
        'users',
        'acl',
        'error-handler',
        'data-source-manager',
        'data-source-main',
        'system-settings',
        'audit-logger',
      ],
    });
    return app as unknown as Application;
  }

  async function loginAdmin(application: Application) {
    const adminUser = await application.db.getRepository('users').findOne({
      filter: { email: 'admin@nocobase.com' },
    });
    const agent = await app.agent().login(adminUser);
    return agent;
  }

  async function countTrails(): Promise<number> {
    return app.db.getRepository('auditTrails').count();
  }

  it('does NOT audit business CRUD when no config rows exist', async () => {
    const application = await createApp();
    const agent = await loginAdmin(application);

    // No auditLoggerConfig rows -> no business auditing.
    expect(await application.db.getRepository(CONFIG_COLLECTION_NAME).count()).toBe(0);

    const before = await countTrails();
    await agent.resource('users').list();
    await new Promise((resolve) => setTimeout(resolve, 100));
    // users:list is not registered (only the configured business actions are),
    // so it must not produce a trail.
    expect(await countTrails()).toBe(before);
  });

  it('audits a configured collection action and stops when the config row is removed', async () => {
    const application = await createApp();
    const agent = await loginAdmin(application);
    const configRepo = application.db.getRepository(CONFIG_COLLECTION_NAME);

    // Register users:list for auditing by writing a config row. The afterSave
    // hook rebuilds the registration set.
    await configRepo.create({ values: { collection: 'users', action: 'list' } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const before = await countTrails();
    await agent.resource('users').list();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await countTrails()).toBe(before + 1);

    // Remove the config row; the afterDestroy hook clears the registration.
    await configRepo.destroy({ filter: { collection: 'users', action: 'list' } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const between = await countTrails();
    await agent.resource('users').list();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await countTrails()).toBe(between);
  });

  it('configuring a business collection never sweeps up other unconfigured actions', async () => {
    const application = await createApp();
    const agent = await loginAdmin(application);
    const configRepo = application.db.getRepository(CONFIG_COLLECTION_NAME);

    // Configure only users:list.
    await configRepo.create({ values: { collection: 'users', action: 'list' } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const before = await countTrails();
    // users:get is NOT configured -> must not be audited.
    const adminUser = await application.db.getRepository('users').findOne({
      filter: { email: 'admin@nocobase.com' },
    });
    await agent.resource('users').get({ filterByTk: adminUser.get('id') });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await countTrails()).toBe(before);
  });

  it('system actions (auth) remain audited regardless of business config', async () => {
    const application = await createApp();
    const agent = await loginAdmin(application);
    const configRepo = application.db.getRepository(CONFIG_COLLECTION_NAME);

    // Add some business config, then confirm auth:signIn (a system-registered
    // action) is still audited and unaffected.
    await configRepo.create({ values: { collection: 'users', action: 'list' } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const before = await countTrails();
    // A failed sign-in is a registered auth action -> always produces a trail.
    await agent.post('/api/auth:signIn').send({ email: 'nobody@nocobase.com', password: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await countTrails()).toBeGreaterThan(before);
  });
});
