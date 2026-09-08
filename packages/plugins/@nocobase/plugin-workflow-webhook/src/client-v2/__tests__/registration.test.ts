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
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please see: https://www.nocobase.com/agreement.
 */

import { describe, expect, it, vi } from 'vitest';

import { EVENT_TYPE } from '../../common/constants';
import PluginWorkflowWebhookClientV2 from '../plugin';
import WebhookTriggerV2 from '../WebhookTrigger';

describe('plugin-workflow-webhook v2 registration', () => {
  it('registers the webhook trigger with the v2 workflow plugin', async () => {
    const workflowPlugin = { registerTrigger: vi.fn() };
    const plugin = Object.create(PluginWorkflowWebhookClientV2.prototype) as PluginWorkflowWebhookClientV2;
    (plugin as unknown as { app: unknown }).app = { pm: { get: () => workflowPlugin } };

    await plugin.load();

    expect(workflowPlugin.registerTrigger).toHaveBeenCalledWith(EVENT_TYPE, WebhookTriggerV2);
  });

  it('keeps trigger validation aligned with v1', () => {
    const trigger = new WebhookTriggerV2();

    expect(trigger.validate({ methods: ['POST'] })).toBe(true);
    expect(trigger.validate({ methods: ['GET', 'POST'] })).toBe(true);
    expect(trigger.validate({ methods: [] })).toBe(false);
    expect(trigger.validate({})).toBe(false);
    expect(trigger.validate({ methods: ['FETCH'] })).toBe(false);
  });

  it('defaults to POST like the v1 fieldset', () => {
    const trigger = new WebhookTriggerV2();

    expect(trigger.createDefaultConfig()).toEqual({ methods: ['POST'] });
  });

  it('exposes v2 config loaders', () => {
    const trigger = new WebhookTriggerV2();

    expect(typeof trigger.FieldsetLoader).toBe('function');
    expect(typeof trigger.TriggerFieldsetLoader).toBe('function');
  });
});
