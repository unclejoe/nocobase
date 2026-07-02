/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * v1 client (SchemaComponent) entry for the approval plugin.
 *
 * Registers:
 *   - the approval instruction node UI (registerInstruction)
 *   - the approval task-center entry (registerTaskType)
 *   - the approval trigger UI (registerTrigger)
 */

import { Plugin } from '@nocobase/client';
import WorkflowPlugin, { Trigger } from '@nocobase/plugin-workflow/client';

import ApprovalInstructionClient from './instruction';
import { AudienceSourceSelect } from './instruction/AudienceSourceSelect';
import approvalTodo from './ApprovalTodo';
import ApprovalCenter from './ApprovalCenter';
import {
  SubmitForApprovalAction,
  submitForApprovalActionInitializer,
  useSubmitForApprovalActionProps,
} from './SubmitForApprovalInitializer';
import { RelatedApprovalsModel } from '../client-v2/RelatedApprovalsModel';
import {
  SubmitForApprovalActionModel,
  registerSubmitForApprovalAction,
} from '../client-v2/SubmitForApprovalActionModel';
import { lang } from '../locale';
import { INSTRUCTION_TYPE, TASK_TYPE_APPROVAL, TRIGGER_TYPE } from '../common/constants';

/** Minimal trigger UI descriptor (config panel rendered by the workflow designer). */
class ApprovalTriggerClient extends Trigger {
  title = lang('Approval trigger');
  // Shown as the trigger's one-line intro in the "Select trigger" dropdown.
  description = lang(
    'Triggered when a record is submitted for approval. The workflow then routes the request to approvers and drives the approval flow.',
  );
  type = TRIGGER_TYPE;
  // The audience selector component is referenced by the `audiences` field
  // below via x-component name.
  components = { AudienceSourceSelect };
  fieldset = {
    collection: {
      type: 'string',
      title: lang('Approver source'),
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'RemoteSelect',
      'x-component-props': {
        service: { resource: 'collections' },
        fieldNames: { label: 'title', value: 'name' },
        manual: false,
      },
    },
    // Audience scope (§4.7): restricts who can view this workflow's approvals.
    // Left empty (default) the workflow is visible to everyone — the legacy
    // behaviour. The afterSave hook in Plugin.ts mirrors these into the
    // approvalAudiences table for the visibility filter to consume.
    audiences: {
      type: 'array',
      title: lang('Audience'),
      description: lang(
        "Who can view this workflow's approvals. Leave empty to keep approvals visible to all logged-in users.",
      ),
      'x-decorator': 'FormItem',
      'x-component': 'ArrayItems',
      'x-component-props': { className: 'wf-approval-audiences' },
      items: {
        type: 'object',
        properties: {
          sort: { type: 'void', 'x-component': 'ArrayItems.SortHandle' },
          audience: {
            type: 'object',
            'x-component': 'AudienceSourceSelect',
            'x-decorator': 'FormItem',
            default: { type: 'user' },
          },
          remove: { type: 'void', 'x-component': 'ArrayItems.Remove' },
        },
      },
      properties: {
        add: {
          type: 'void',
          title: lang('Add audience'),
          'x-component': 'ArrayItems.Addition',
        },
      },
    },
  };
}

export default class PluginWorkflowApprovalClient extends Plugin {
  async load() {
    const workflow = this.app.pm.get('workflow') as WorkflowPlugin;

    workflow.registerInstruction(INSTRUCTION_TYPE, ApprovalInstructionClient);
    workflow.registerTrigger(TRIGGER_TYPE, ApprovalTriggerClient);
    workflow.registerTaskType(TASK_TYPE_APPROVAL, approvalTodo);

    // The v2 client registers its center through the new two-layer
    // pluginSettingsManager, which is decoupled from this app's v1 settings
    // registry — so the "Approval center" menu never renders. Register the v1
    // Approval Center page through the v1 pluginSettingsManager so the entry
    // appears under Settings and approvers / applicants can reach their tasks.
    this.app.pluginSettingsManager.add('workflow-approval', {
      icon: 'CheckSquareOutlined',
      title: lang('Approval center'),
      Component: ApprovalCenter,
      isPinned: true,
      sort: 310,
      aclSnippet: 'pm.workflow-approval',
    });

    // Also expose the Approval Center as a top-level route so it can be linked
    // from the main navigation menu (审批人不必钻进「设置」找待办) and from the
    // workbench pending-approval card. The component is the same v1 ApprovalCenter.
    this.app.router.add('admin.approvals.center', {
      path: '/admin/approvals/center/:tab?',
      Component: ApprovalCenter,
    });

    // Register the FlowModel classes used by the v2 client surface tree but
    // resolved through this v1-loaded app's shared flowEngine instance.
    //   - RelatedApprovalsModel backs the 审批 tab's related-approvals list
    //     block; without it the tab throws
    //     "Model class 'RelatedApprovalsModel' not found".
    //   - SubmitForApprovalActionModel must be registered GLOBALLY on the
    //     flowEngine (not just on RecordActionGroupModel.currentModels via
    //     registerSubmitForApprovalAction) so that a flowModel node with
    //     use:"SubmitForApprovalActionModel" can be resolved by the engine's
    //     getModelClass() — the same path ViewActionModel / EditActionModel
    //     take. Without this global registration the action node renders
    //     nothing (the surface projector + engine cannot resolve the class).
    this.app.flowEngine.registerModels({ RelatedApprovalsModel, SubmitForApprovalActionModel });

    // Register the "Submit for approval" action model into the record-detail
    // FlowEngine designer. Uses the async class resolver so it waits for
    // RecordActionGroupModel to be registered by the flow-engine plugin.
    void registerSubmitForApprovalAction(this.app.flowEngine);

    // Register the "Submit for approval" action button so admins can drop it
    // onto a business record's detail/form actions (§4.5).
    this.app.addComponents({ SubmitForApprovalAction });
    this.app.addScopes({ useSubmitForApprovalActionProps });
    this.app.schemaInitializerManager
      .get('details:configureActions')
      .add('approval.submit', submitForApprovalActionInitializer);
    this.app.schemaInitializerManager
      .get('detailsWithPaging:configureActions')
      .add('approval.submit', submitForApprovalActionInitializer);
    this.app.schemaInitializerManager
      .get('createForm:configureActions')
      .add('approval.submit', submitForApprovalActionInitializer);
  }
}
