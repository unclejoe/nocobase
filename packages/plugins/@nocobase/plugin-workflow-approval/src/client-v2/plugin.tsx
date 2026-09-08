/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * v2 client (FlowEngine) entry for the approval plugin.
 *
 * Registers the "Approval center" settings page with a pending/processed list
 * and an approval analytics page.
 */

import type { Application } from '@nocobase/client-v2';
import { Plugin } from '@nocobase/client-v2';

import WorkflowPlugin from '@nocobase/plugin-workflow/client-v2';

import { NAMESPACE, TRIGGER_TYPE } from '../common/constants';
import { RelatedApprovalsModel } from './RelatedApprovalsModel';
import { registerSubmitForApprovalAction } from './SubmitForApprovalActionModel';
import ApprovalTriggerV2 from './triggers/ApprovalTrigger';

export class PluginWorkflowApprovalClientV2 extends Plugin<Record<string, never>, Application> {
  async load() {
    // Register the approval trigger into the v2 workflow canvas so workflows of
    // this type can be selected, configured and executed there (the server-side
    // trigger is shared with v1; only the config form needed a v2 port).
    const workflow = this.app.pm.get('workflow') as WorkflowPlugin;
    workflow.registerTrigger(TRIGGER_TYPE, ApprovalTriggerV2);

    // Register the FlowModel class backing the 审批 tab's related-approvals
    // list block. Without this, the tab throws
    // "Model class 'RelatedApprovalsModel' not found. Please register it first."
    this.app.flowEngine.registerModels({ RelatedApprovalsModel });

    // Register the "Submit for approval" action model into the v2 record-detail
    // designer. Uses the async class resolver to wait for RecordActionGroupModel.
    await registerSubmitForApprovalAction(this.app.flowEngine);

    const centerTitle = this.t('Approval center', { ns: NAMESPACE }) as unknown as string;

    this.pluginSettingsManager.addMenuItem({
      key: 'workflow-approval',
      title: centerTitle,
      icon: 'CheckSquareOutlined',
      aclSnippet: 'pm.workflow-approval',
    });

    this.pluginSettingsManager.addPageTabItem({
      menuKey: 'workflow-approval',
      key: 'pending',
      title: this.t('My pending approvals', { ns: NAMESPACE }) as unknown as string,
      componentLoader: () => import('./pages/ApprovalsCenterPage'),
    });

    this.pluginSettingsManager.addPageTabItem({
      menuKey: 'workflow-approval',
      key: 'analytics',
      title: this.t('Approval analytics', { ns: NAMESPACE }) as unknown as string,
      componentLoader: () => import('./pages/ApprovalAnalyticsPage'),
    });
  }
}

export default PluginWorkflowApprovalClientV2;
