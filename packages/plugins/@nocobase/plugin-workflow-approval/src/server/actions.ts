/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Approval HTTP actions.
 *
 *   approvals:submit  — create an approval (with business snapshot) and trigger
 *                       the matching approval workflow.
 *   approvals:approve — current user approves a pending record, resuming the job.
 *   approvals:reject  — current user rejects a pending record.
 *   approvals:return  — current user returns the approval to a prior node.
 *   approvals:listMine — list the current user's approval records.
 *
 * The submit/approve/reject/return actions always mutate the approval data
 * model (approvalRecords / approvalExecutions / approvals) and then hand off
 * to the workflow engine via plugin.resume(job) — mirroring the manual plugin.
 */

import actions, { Context, utils } from '@nocobase/actions';
import PluginWorkflowServer, { EXECUTION_STATUS, JOB_STATUS } from '@nocobase/plugin-workflow';

import {
  APPROVAL_COLLECTION,
  APPROVAL_RECORD_COLLECTION,
  APPROVAL_RECORD_STATUS,
  APPROVAL_STATUS,
  TRIGGER_TYPE,
} from '../common/constants';
import { createApprovalFromSubmission } from './ApprovalTrigger';

/** Submit a business record for approval. */
export async function submit(context: Context, next: () => Promise<void>) {
  const { values } = context.action.params;
  const { currentUser } = context.state;
  if (!currentUser) {
    return context.throw(401);
  }
  const { collection, dataKey, workflowId } = values || {};
  if (!collection || dataKey == null || !workflowId) {
    return context.throw(400, 'collection, dataKey and workflowId are required');
  }

  const plugin = context.app.pm.get(PluginWorkflowServer) as PluginWorkflowServer;
  const db = context.db;

  // Snapshot the full business record (with associations) at submission time.
  // §5.4 requires the snapshot to contain the full association JSON, so we
  // append every association field the target collection declares.
  const targetCollection = db.getCollection(collection);
  if (!targetCollection) {
    return context.throw(400, `collection "${collection}" not found`);
  }
  const targetRepo = db.getRepository(collection);
  if (!targetRepo) {
    return context.throw(400, `collection "${collection}" not found`);
  }
  const associationFields = Array.from(targetCollection.fields.values())
    .filter((f) => f.type === 'belongsTo' || f.type === 'hasOne' || f.type === 'hasMany' || f.type === 'belongsToMany')
    .map((f) => f.name);
  const snapshot = await targetRepo.findOne({
    filterByTk: dataKey,
    appends: associationFields,
    context,
  });
  if (!snapshot) {
    return context.throw(404, 'business record not found');
  }

  const workflow = await db.getRepository('workflows').findOne({ filterByTk: workflowId, context });
  if (!workflow || workflow.get('type') !== TRIGGER_TYPE) {
    return context.throw(400, 'target workflow is not an approval workflow');
  }

  // Create the approval row carrying the snapshot.
  const { id: approvalId } = await createApprovalFromSubmission(db, {
    collection,
    dataKey,
    workflowId,
    workflowKey: workflow.get('key'),
    snapshot: snapshot.toJSON(),
    applicantUserId: currentUser.id,
    applicantRoleName: currentUser.roleName ?? null,
  });

  // Trigger the workflow with the approval id in context.
  const trigger = plugin.triggers.get(TRIGGER_TYPE);
  if (trigger) {
    await plugin.trigger(workflow, {
      approvalId,
      data: { collection, dataKey, approvalId },
      user: { id: currentUser.id },
    });
  }

  context.body = { id: approvalId };
  context.status = 202;
  await next();
}

/** Shared decision handler for approve / reject / return. */
async function decide(context: Context, next: () => Promise<void>, decision: 'approve' | 'reject' | 'return') {
  const { filterByTk, values } = context.action.params;
  const { currentUser } = context.state;
  if (!currentUser) {
    return context.throw(401);
  }

  const plugin = context.app.pm.get(PluginWorkflowServer) as PluginWorkflowServer;
  const db = context.db;

  const RecordRepo = db.getRepository(APPROVAL_RECORD_COLLECTION);
  const record = await RecordRepo.findOne({
    filterByTk,
    appends: ['job', 'node', 'execution', 'workflow', 'approval'],
    context,
  });
  if (!record) {
    return context.throw(404);
  }
  if (record.get('userId') !== currentUser.id) {
    return context.throw(403);
  }
  if (record.get('status') !== APPROVAL_RECORD_STATUS.PENDING) {
    return context.throw(400, 'record is not pending');
  }

  const execution = record.get('execution');
  if (!execution || execution.status !== EXECUTION_STATUS.STARTED) {
    return context.throw(400, 'execution is not active');
  }

  const newStatus = decision === 'approve' ? APPROVAL_RECORD_STATUS.APPROVED : APPROVAL_RECORD_STATUS.INVALID; // reject & return both invalidate this record

  record.set({
    status: newStatus,
    comment: values?.comment ?? record.get('comment'),
    returnToNodeKey: decision === 'return' ? values?.returnToNodeKey ?? null : record.get('returnToNodeKey'),
    dataBefore: values?.dataBefore ?? record.get('dataBefore'),
    dataAfter: values?.dataAfter ?? record.get('dataAfter'),
    changes: values?.changes ?? record.get('changes'),
  });
  await record.save();

  // Update the parent approval's status + latestExecutionId so the record
  // list and AI summary reflect the current round's outcome. Approve/return
  // mark the record; the Instruction.resume() drives final workflow status.
  const approval = record.get('approval');
  if (approval) {
    const ApprovalRepo = db.getRepository(APPROVAL_COLLECTION);
    const patch: { status?: number; latestExecutionId?: number | string } = {
      latestExecutionId: record.get('approvalExecutionId') ?? undefined,
    };
    if (decision === 'reject') {
      patch.status = APPROVAL_STATUS.FINISHED;
    } else if (decision === 'approve') {
      // Leave FINISHED-setting to Instruction.resume when all approvers approve;
      // a single approve keeps the approval IN_PROGRESS.
    }
    await ApprovalRepo.update({ filterByTk: approval.get('id'), values: patch, context });
  }

  // Resume the workflow job so ApprovalInstruction.resume can aggregate.
  const job = record.get('job');
  const processor = plugin.createProcessor(execution);
  await processor.prepare();
  await processor.exit();

  if (job) {
    job.execution = execution;
    plugin.resume(job);
  }

  context.body = record;
  context.status = 202;
  await next();
}

export async function approve(context: Context, next: () => Promise<void>) {
  return decide(context, next, 'approve');
}

export async function reject(context: Context, next: () => Promise<void>) {
  return decide(context, next, 'reject');
}

export async function returnBack(context: Context, next: () => Promise<void>) {
  return decide(context, next, 'return');
}

// Canonical name per the requirements spec (§6); `return` is a JS reserved
// word so the handler is named returnBack, but we expose `return` as an alias
// for ACL/resource registration where the literal action name is needed.
export { returnBack as returnAction };

/** List the current user's approval records (used by the task center). */
export async function listMine(context: Context, next: () => Promise<void>) {
  context.action.mergeParams({
    filter: {
      userId: context.state.currentUser.id,
    },
  });
  return actions.list(context, next);
}
