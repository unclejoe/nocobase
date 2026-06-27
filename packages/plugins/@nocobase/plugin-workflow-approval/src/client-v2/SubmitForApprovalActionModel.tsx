/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * SubmitForApprovalActionModel — the v2 (FlowEngine) action model that lets an
 * admin add a "Submit for approval" button to a business record's action bar.
 *
 * Without this, the v2 record-detail designer has no "Submit for approval"
 * option in its action picker, so users cannot actually initiate an approval.
 * The action picks an approval workflow bound to the record's collection, then
 * calls approvals:submit with the record id.
 *
 * Mirrors plugin-workflow-custom-action-trigger's RecordTriggerWorkflowActionModel.
 */

import { ActionModel, ActionSceneEnum } from '@nocobase/client-v2';
import type { FlowEngine, ModelConstructor } from '@nocobase/flow-engine';
import type { ButtonProps } from 'antd/es/button';
import { NAMESPACE, TRIGGER_TYPE } from '../common/constants';
import { tExpr } from './locale';

type ActionGroupModelClass = ModelConstructor & {
  registerActionModels?: (models: Record<string, ModelConstructor>) => void;
};

function getRecordKey(record: any, collection: any): unknown {
  if (!record || !collection) {
    return null;
  }
  const filterTargetKey = collection.filterTargetKey;
  if (Array.isArray(filterTargetKey)) {
    return filterTargetKey.reduce((acc: Record<string, unknown>, key: string) => {
      acc[key] = record[key];
      return acc;
    }, {});
  }
  return record[filterTargetKey];
}

export class SubmitForApprovalActionModel extends ActionModel {
  static scene = ActionSceneEnum.record;
  defaultProps: ButtonProps = {
    title: tExpr('Submit for approval'),
  };
}

SubmitForApprovalActionModel.define({
  label: tExpr('Submit for approval'),
});

SubmitForApprovalActionModel.registerFlow({
  key: 'submitForApprovalActionSettings',
  on: 'click',
  title: tExpr('Submit for approval'),
  steps: {
    confirm: {
      use: 'confirm',
    },
    selectWorkflow: {
      title: tExpr('Submit for approval'),
      uiSchema: {
        workflowId: {
          type: 'number',
          title: tExpr('Approval workflow'),
          required: true,
          'x-decorator': 'FormItem',
          'x-component': 'RemoteSelect',
          'x-component-props': {
            service: { resource: 'workflows', params: { filter: { type: TRIGGER_TYPE, enabled: true } } },
            fieldNames: { label: 'title', value: 'id' },
            manual: false,
          },
        },
      },
      async handler(ctx: any, params: any) {
        const { resource, collection } = ctx.blockModel ?? {};
        if (!resource || !collection) {
          ctx.exit();
          return;
        }
        const workflowId = params.workflowId;
        if (!workflowId) {
          ctx.message.error(ctx.t('Please select an approval workflow', { ns: NAMESPACE }));
          ctx.exit();
          return;
        }
        try {
          await ctx.api.request({
            url: 'approvals:submit',
            method: 'post',
            data: {
              collection: collection.name,
              dataKey: getRecordKey(ctx.record, collection),
              workflowId,
            },
          });
        } catch (error) {
          console.error('Error submitting approval:', error);
          ctx.exit();
        }
      },
    },
    afterSuccess: {
      use: 'afterSuccess',
      defaultParams: {
        successMessage: tExpr('Approval submitted successfully'),
        actionAfterSuccess: 'previous',
      },
    },
  },
});

/** Register the action model into the record action group so it appears in the designer. */
export function registerSubmitForApprovalAction(flowEngine: FlowEngine) {
  const recordActionGroup = flowEngine.getModelClass('RecordActionGroupModel') as ActionGroupModelClass | undefined;
  recordActionGroup?.registerActionModels?.({ SubmitForApprovalActionModel });
}
