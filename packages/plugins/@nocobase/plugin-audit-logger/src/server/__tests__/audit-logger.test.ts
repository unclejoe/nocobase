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

import { createMockServer, MockServer } from '@nocobase/test';
import type { Application } from '@nocobase/server';

describe('audit-logger plugin', () => {
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

  it('registers a logger into app.auditManager on load', async () => {
    await createApp();
    expect(app.auditManager.logger).toBeDefined();
    expect(typeof app.auditManager.logger.log).toBe('function');
  });

  it('persists a trail for a registered action with correct fields', async () => {
    const application = await createApp();
    // Register a request-level action to audit. The collection framework is
    // untouched; this only configures which action the manager observes.
    application.auditManager.registerAction('users:list');

    const adminUser = await app.db.getRepository('users').findOne({
      filter: { email: 'admin@nocobase.com' },
    });
    const adminAgent = await app.agent().login(adminUser);
    // Set an explicit User-Agent so the ua capture path is exercised.
    adminAgent.set('User-Agent', 'audit-logger-test/1.0');

    const res = await adminAgent.resource('users').list();
    expect(res.status).toBe(200);

    // The audit middleware writes asynchronously in the response `finally`
    // block; allow the persist to land before querying.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const trails = await app.db.getRepository('auditTrails').find();
    expect(trails.length).toBe(1);
    const trail = trails[0].toJSON();

    expect(trail.resource).toBe('users');
    expect(trail.action).toBe('list');
    expect(String(trail.userId)).toBe(String(adminUser.id));
    // ip is always captured from the request socket / x-forwarded-for.
    expect(typeof trail.ip).toBe('string');
    expect(trail.ip.length).toBeGreaterThan(0);
    // ua is captured from the User-Agent header.
    expect(trail.ua).toBe('audit-logger-test/1.0');
    expect(trail.status).toBe(200);
    expect(trail.metadata).toBeDefined();
    expect(trail.metadata.request).toBeDefined();
    expect(trail.createdAt).toBeDefined();
  });

  it('does NOT persist a trail for an unregistered action', async () => {
    const application = await createApp();
    // Nothing registered for roles:list.
    const before = await app.db.getRepository('auditTrails').count();
    expect(before).toBe(0);

    const adminUser = await app.db.getRepository('users').findOne({
      filter: { email: 'admin@nocobase.com' },
    });
    const adminAgent = await app.agent().login(adminUser);

    await adminAgent.resource('roles').list();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const after = await app.db.getRepository('auditTrails').count();
    expect(after).toBe(0);
  });

  it('exposes auditTrails as a read-only resource gated by ACL snippet', async () => {
    await createApp();
    const adminUser = await app.db.getRepository('users').findOne({
      filter: { email: 'admin@nocobase.com' },
    });
    const adminAgent = await app.agent().login(adminUser);

    // list is allowed
    const listRes = await adminAgent.resource('auditTrails').list();
    expect(listRes.status).toBe(200);

    // create is not exposed (read-only resource)
    const createRes = await adminAgent.resource('auditTrails').create({
      values: { resource: 'x', action: 'y' },
    });
    expect([400, 404]).toContain(createRes.status);
  });

  it('end-to-end: a real auth:signIn request (core-registered action) produces a queryable trail', async () => {
    // auth:signIn is registered for auditing by the core auth plugin; this test
    // exercises the full pipeline through a real HTTP sign-in request and then
    // reads the trail back through the read-only auditTrails:list API.
    await createApp();

    // Trigger a real sign-in over HTTP (the core-registered audited action).
    const signInRes = await app
      .agent()
      .set('X-Role', 'root')
      .set('User-Agent', 'e2e-audit/1.0')
      .resource('auth')
      .signIn({
        values: { email: 'admin@nocobase.com', password: 'admin123' },
      });
    expect(signInRes.status).toBe(200);

    // Allow the asynchronous audit persist (runs in the response `finally`)
    // to land before querying.
    await new Promise((resolve) => setTimeout(resolve, 150));

    const count = await app.db.getRepository('auditTrails').count();
    expect(count).toBeGreaterThanOrEqual(1);

    const trails = await app.db.getRepository('auditTrails').find({
      filter: { resource: 'auth', action: 'signIn' },
    });
    expect(trails.length).toBeGreaterThanOrEqual(1);
    const trail = trails[0].toJSON();
    expect(trail.resource).toBe('auth');
    expect(trail.action).toBe('signIn');
    expect(trail.status).toBe(200);
    expect(trail.ua).toBe('e2e-audit/1.0');
    expect(trail.metadata).toBeDefined();

    // The trail is queryable through the read-only HTTP API.
    const adminUser = await app.db.getRepository('users').findOne({
      filter: { email: 'admin@nocobase.com' },
    });
    const adminAgent = await app.agent().login(adminUser);
    const listRes = await adminAgent.resource('auditTrails').list({
      filter: { resource: 'auth', action: 'signIn' },
      pageSize: 1,
    });
    expect(listRes.status).toBe(200);
    const rows = listRes.body?.data ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].resource).toBe('auth');
    expect(rows[0].action).toBe('signIn');
  });
});
