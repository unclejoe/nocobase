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
import approvalTodo from './ApprovalTodo';
import {
  SubmitForApprovalAction,
  submitForApprovalActionInitializer,
  useSubmitForApprovalActionProps,
} from './SubmitForApprovalInitializer';
import { RelatedApprovalsModel } from '../client-v2/RelatedApprovalsModel';
import { lang } from '../locale';
import { INSTRUCTION_TYPE, TASK_TYPE_APPROVAL, TRIGGER_TYPE } from '../common/constants';

/** Minimal trigger UI descriptor (config panel rendered by the workflow designer). */
class ApprovalTriggerClient extends Trigger {
  title = lang('Approval trigger');
  type = TRIGGER_TYPE;
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
  };
}

export default class PluginWorkflowApprovalClient extends Plugin {
  async load() {
    const workflow = this.app.pm.get('workflow') as WorkflowPlugin;

    workflow.registerInstruction(INSTRUCTION_TYPE, ApprovalInstructionClient);
    workflow.registerTrigger(TRIGGER_TYPE, ApprovalTriggerClient);
    workflow.registerTaskType(TASK_TYPE_APPROVAL, approvalTodo);

    // Register the FlowModel class backing the 审批 tab's related-approvals
    // list block. Without this, the tab throws
    // "Model class 'RelatedApprovalsModel' not found. Please register it first."
    this.app.flowEngine.registerModels({ RelatedApprovalsModel });

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
