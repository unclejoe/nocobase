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

/** A business record row keyed by an arbitrary key (id or composite). */
type RecordRow = Record<string, unknown>;

/** Minimal collection shape read by getRecordKey. */
interface CollectionLike {
  name?: string;
  filterTargetKey: string | string[];
}

/** Minimal step-handler context shape used by the submit handler. */
interface SubmitHandlerCtx {
  blockModel?: { resource?: unknown; collection?: CollectionLike };
  record?: RecordRow;
  api: { request: (config: Record<string, unknown>) => Promise<{ data?: { data?: Array<{ id?: number | string }> } }> };
  t: (key: string, opts?: Record<string, unknown>) => string;
  message: { error: (msg: string) => void };
  exit: () => void;
}

function getRecordKey(record: RecordRow | undefined, collection: CollectionLike | undefined): unknown {
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
      async handler(ctx: SubmitHandlerCtx, params: { workflowId?: number | string }) {
        const { resource, collection } = ctx.blockModel ?? {};
        if (!resource || !collection) {
          ctx.exit();
          return;
        }
        let workflowId = params.workflowId;
        // The selectWorkflow step's RemoteSelect form only renders when the
        // designer attaches the full step UI. When the button is added without
        // that UI (e.g. programmatically), fall back to auto-resolving the
        // single enabled approval workflow bound to this collection, so the
        // submit still works instead of dead-ending on "Please select a workflow".
        if (!workflowId) {
          try {
            const resp = await ctx.api.request({
              url: 'workflows:list',
              params: {
                filter: { $and: [{ type: 'approval' }, { enabled: true }, { 'config.collection': collection.name }] },
                fields: ['id'],
                pageSize: 1,
              },
            });
            workflowId = resp?.data?.data?.[0]?.id;
          } catch {
            workflowId = undefined;
          }
        }
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
export async function registerSubmitForApprovalAction(flowEngine: FlowEngine) {
  // Use the async resolver: RecordActionGroupModel is registered by the
  // flow-engine plugin, which may not have loaded yet when this runs. The async
  // version awaits the class becoming available (per custom-action-trigger's
  // pattern). Falls back to sync if the async API is unavailable.
  const engine = flowEngine as FlowEngine & {
    getModelClassAsync?: (name: string) => Promise<unknown>;
  };
  if (typeof engine.getModelClassAsync === 'function') {
    await engine.getModelClassAsync('RecordActionGroupModel');
  }
  const recordActionGroup = flowEngine.getModelClass('RecordActionGroupModel') as ActionGroupModelClass | undefined;
  recordActionGroup?.registerActionModels?.({ SubmitForApprovalActionModel });
}
