/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * ApprovalTrigger — the workflow "Approval" trigger.
 *
 * Fires when a business record is submitted for approval (via the submit
 * action in actions.ts). The trigger creates an `approvals` row carrying a
 * full snapshot of the business record, then hands control to the workflow
 * engine which will reach the ApprovalInstruction node.
 *
 * Registration pattern mirrors plugin-workflow-webhook/WebhookTrigger.
 */

import { Trigger } from '@nocobase/plugin-workflow';
import type { WorkflowModel } from '@nocobase/plugin-workflow';
import { APPROVAL_COLLECTION, APPROVAL_STATUS } from '../common/constants';

export interface ApprovalTriggerConfig {
  /** The business collection whose records can be submitted for approval. */
  collection?: string;
  /** The submit action button label / context. */
  action?: Record<string, unknown>;
}

export default class ApprovalTrigger extends Trigger {
  // The trigger itself is event-driven (the submit action calls into the
  // workflow engine directly), so on/off are no-ops here. The submit action
  // in actions.ts resolves the workflow by its type='approval' + collection
  // and triggers it via the workflow plugin dispatcher.
  on(workflow: WorkflowModel): void {
    void workflow;
  }

  off(workflow: WorkflowModel): void {
    void workflow;
  }

  duplicateConfig(workflow: WorkflowModel): object {
    const config = (workflow.config || {}) as ApprovalTriggerConfig;
    return { ...config };
  }
}

/**
 * Helper used by the submit action: create the approval row (with snapshot)
 * and return the payload to feed into the workflow trigger context.
 */
export async function createApprovalFromSubmission(
  db: import('@nocobase/database').Database,
  params: {
    collection: string;
    dataKey: string | number;
    workflowId: number | string;
    workflowKey: string;
    snapshot: Record<string, unknown>;
    applicantUserId?: number | string | null;
    applicantRoleName?: string;
    action?: Record<string, unknown>;
  },
): Promise<{ id: number | string }> {
  const Repo = db.getRepository(APPROVAL_COLLECTION);
  const row = await Repo.create({
    values: {
      collectionName: params.collection,
      dataKey: String(params.dataKey),
      workflowId: params.workflowId,
      workflowKey: params.workflowKey,
      status: APPROVAL_STATUS.IN_PROGRESS,
      data: params.snapshot,
      applicantRoleName: params.applicantRoleName ?? null,
      action: params.action ?? {},
      createdById: params.applicantUserId ?? null,
      updatedById: params.applicantUserId ?? null,
    },
  });
  return { id: row.get('id') };
}
