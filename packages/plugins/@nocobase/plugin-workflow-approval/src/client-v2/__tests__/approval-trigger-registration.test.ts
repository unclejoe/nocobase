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

import { TRIGGER_TYPE } from '../../common/constants';
import { PluginWorkflowApprovalClientV2 } from '../plugin';
import ApprovalTriggerV2 from '../triggers/ApprovalTrigger';

vi.mock('../SubmitForApprovalActionModel', () => ({
  registerSubmitForApprovalAction: vi.fn().mockResolvedValue(undefined),
}));

describe('plugin-workflow-approval v2 trigger registration', () => {
  it('registers the approval trigger with the v2 workflow plugin', async () => {
    const workflowPlugin = { registerTrigger: vi.fn() };
    const plugin = Object.create(PluginWorkflowApprovalClientV2.prototype) as unknown as {
      app: unknown;
      t: (key: string) => string;
      load: () => Promise<void>;
    };
    plugin.t = (key: string) => key;
    plugin.app = {
      pm: { get: () => workflowPlugin },
      flowEngine: { registerModels: vi.fn() },
      pluginSettingsManager: {
        addMenuItem: vi.fn(),
        addPageTabItem: vi.fn(),
      },
    };

    await plugin.load();

    expect(workflowPlugin.registerTrigger).toHaveBeenCalledWith(TRIGGER_TYPE, ApprovalTriggerV2);
  });

  it('requires an approver source collection like v1', () => {
    const trigger = new ApprovalTriggerV2();

    expect(trigger.validate({ collection: 'users' })).toBe(true);
    expect(trigger.validate({})).toBe(false);
    expect(trigger.validate({ audiences: [] })).toBe(false);
  });

  it('exposes the v2 config loader', () => {
    const trigger = new ApprovalTriggerV2();

    expect(typeof trigger.FieldsetLoader).toBe('function');
  });
});
