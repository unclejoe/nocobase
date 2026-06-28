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

import { NAMESPACE } from '../common/constants';
import { RelatedApprovalsModel } from './RelatedApprovalsModel';
import { registerSubmitForApprovalAction } from './SubmitForApprovalActionModel';

export class PluginWorkflowApprovalClientV2 extends Plugin<Record<string, never>, Application> {
  async load() {
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
