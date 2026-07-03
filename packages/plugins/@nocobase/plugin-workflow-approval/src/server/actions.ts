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
 *   approvals:submit   — create an approval (with business snapshot) and trigger
 *                        the matching approval workflow.
 *   approvals:approve  — current user approves a pending record, resuming the job.
 *   approvals:reject   — current user rejects a pending record.
 *   approvals:returnBack — current user returns the approval (ends this execution;
 *                        applicant may resubmit, starting a new execution).
 *   approvals:resubmit — applicant re-triggers the workflow after a return (§8.3).
 *   approvals:withdraw — applicant cancels the approval (status=-1), aborting the
 *                        active execution and ending the flow (§8.5 Cancel).
 *   approvals:listMine / listSubmitted — list approver / applicant records.
 *
 * The submit/approve/reject/return actions always mutate the approval data
 * model (approvalRecords / approvalExecutions / approvals) and then hand off
 * to the workflow engine via plugin.resume(job) — mirroring the manual plugin.
 */

import actions, { Context, utils } from '@nocobase/actions';
import PluginWorkflowServer, {
  EXECUTION_STATUS,
  EXECUTION_REASON,
  JOB_STATUS,
  abortExecution,
} from '@nocobase/plugin-workflow';

import {
  APPROVAL_COLLECTION,
  APPROVAL_EXECUTION_COLLECTION,
  APPROVAL_EXECUTION_STATUS,
  APPROVAL_RECORD_COLLECTION,
  APPROVAL_RECORD_STATUS,
  APPROVAL_STATUS,
  INSTRUCTION_TYPE,
  TRIGGER_TYPE,
} from '../common/constants';
import { createApprovalFromSubmission } from './ApprovalTrigger';
import { computeFieldDiff } from './computeFieldDiff';
import { buildApprovalVisibilityFilter } from './visibility';

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
    await plugin.resume(job);
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

/**
 * List approvals with audience visibility filtering applied (§4.7).
 *
 * Wraps the default `actions.list` and merges a visibility filter computed from
 * the audience expansion. When no workflows are restricted (no audiences
 * configured anywhere) the filter is null and behaviour is unchanged, so legacy
 * installations keep their open visibility. The applicant + active-approver
 * branches ensure users always see their own involvement.
 */
export async function list(context: Context, next: () => Promise<void>) {
  const userId = context.state.currentUser?.id;
  if (userId != null) {
    const filter = await buildApprovalVisibilityFilter(context.db, userId);
    if (filter) {
      context.action.mergeParams({ filter });
    }
  }
  return actions.list(context, next);
}

/**
 * List approvals submitted by the current user (the applicant's view).
 * Used by the "My submissions" tab so the applicant can see their requests and,
 * when one has been returned, resubmit it.
 */
export async function listSubmitted(context: Context, next: () => Promise<void>) {
  context.action.mergeParams({
    filter: {
      createdById: context.state.currentUser.id,
    },
  });
  return actions.list(context, next);
}

/**
 * Resubmit an approval that was returned to the applicant.
 *
 * After an approver returns a request, the applicant edits the business record
 * (via the normal record update API) and calls this action to start a NEW
 * workflow execution under the SAME approvals row (§8.3 "退回重审"). The new
 * execution reaches the ApprovalInstruction node again, which creates a new
 * approvalExecutions round and a fresh set of approvalRecords linked to the
 * previous round via prevRecordId.
 *
 * Only the original applicant may resubmit, and only while the approval is still
 * IN_PROGRESS with at least one returned (INVALID + returnToNodeKey) record.
 */
export async function resubmit(context: Context, next: () => Promise<void>) {
  const { filterByTk, values } = context.action.params;
  const { currentUser } = context.state;
  if (!currentUser) {
    return context.throw(401);
  }
  const approvalId = filterByTk ?? values?.approvalId;
  if (approvalId == null) {
    return context.throw(400, 'approvalId is required');
  }

  const plugin = context.app.pm.get(PluginWorkflowServer) as PluginWorkflowServer;
  const db = context.db;

  const ApprovalRepo = db.getRepository(APPROVAL_COLLECTION);
  const approval = await ApprovalRepo.findOne({ filterByTk: approvalId, context });
  if (!approval) {
    return context.throw(404);
  }
  if (approval.get('createdById') !== currentUser.id) {
    return context.throw(403, 'Only applicant can resubmit');
  }
  if (approval.get('status') !== APPROVAL_STATUS.IN_PROGRESS) {
    return context.throw(400, 'Approval already finished, cannot resubmit');
  }

  // Confirm there is at least one returned record (INVALID + returnToNodeKey),
  // i.e. the approval is genuinely in the "returned, awaiting resubmit" state.
  const RecordRepo = db.getRepository(APPROVAL_RECORD_COLLECTION);
  const returnedRecord = await RecordRepo.findOne({
    filter: {
      approvalId,
      status: APPROVAL_RECORD_STATUS.INVALID,
      returnToNodeKey: { $ne: null },
    },
    context,
  });
  if (!returnedRecord) {
    return context.throw(400, 'Approval has not been returned');
  }

  // Re-snapshot the (possibly edited) business record so the new round carries
  // the current state. Mirrors the submit action's snapshot logic.
  const collectionName = approval.get('collectionName');
  const dataKey = approval.get('dataKey');
  const targetCollection = db.getCollection(collectionName);
  const targetRepo = targetCollection ? db.getRepository(collectionName) : null;
  let snapshot: { toJSON: () => Record<string, unknown> } | null = null;
  if (targetRepo) {
    const associationFields = Array.from(targetCollection.fields.values())
      .filter(
        (f) => f.type === 'belongsTo' || f.type === 'hasOne' || f.type === 'hasMany' || f.type === 'belongsToMany',
      )
      .map((f) => f.name);
    snapshot = await targetRepo.findOne({ filterByTk: dataKey, appends: associationFields, context });
  }

  const workflowRepo = db.getRepository('workflows');
  const workflow = await workflowRepo.findOne({ filterByTk: approval.get('workflowId'), context });
  if (!workflow || workflow.get('type') !== TRIGGER_TYPE) {
    return context.throw(400, 'target workflow is not an approval workflow');
  }

  // Compute the field-level diff between the previous snapshot and the new one
  // (§4.2), so approvers see what the applicant changed. Done before the
  // approval row is overwritten with the new snapshot.
  const previousSnapshot = (approval.get('data') as Record<string, unknown> | null | undefined) ?? null;
  const newSnapshot = snapshot ? (snapshot.toJSON() as Record<string, unknown>) : null;
  const changes = computeFieldDiff(previousSnapshot, newSnapshot);

  // Refresh the snapshot on the approval row so downstream consumers (UI, AI
  // summary) see the latest business data.
  if (snapshot) {
    await ApprovalRepo.update({
      filterByTk: approvalId,
      values: { data: snapshot.toJSON(), updatedById: currentUser.id },
      context,
    });
  }

  // Start a new execution for the same approval. The trigger payload carries
  // the approvalId (so run() can link the new round via prevRecordId) and the
  // computed `changes` (so each new approvalRecord shows the field-level diff).
  await plugin.trigger(workflow, {
    approvalId,
    data: { collection: collectionName, dataKey, approvalId },
    user: { id: currentUser.id },
    changes,
  });

  context.body = { id: approvalId, changes };
  context.status = 202;
  await next();
}

/**
 * Withdraw (cancel) an approval (§8.5 Cancel).
 *
 * The applicant cancels an in-progress approval: the parent approval is marked
 * WITHDRAWN (status=-1), the active workflow execution is aborted (so pending
 * jobs/records are released), the current approvalExecutions round is marked
 * INTERRUPTED, and any still-pending approvalRecords are invalidated. After this
 * the approval cannot be resubmitted or acted upon.
 *
 * Only the original applicant may withdraw, and only while IN_PROGRESS.
 */
export async function withdraw(context: Context, next: () => Promise<void>) {
  const { filterByTk, values } = context.action.params;
  const { currentUser } = context.state;
  if (!currentUser) {
    return context.throw(401);
  }
  const approvalId = filterByTk ?? values?.approvalId;
  if (approvalId == null) {
    return context.throw(400, 'approvalId is required');
  }

  const plugin = context.app.pm.get(PluginWorkflowServer) as PluginWorkflowServer;
  const db = context.db;

  const ApprovalRepo = db.getRepository(APPROVAL_COLLECTION);
  const approval = await ApprovalRepo.findOne({ filterByTk: approvalId, context });
  if (!approval) {
    return context.throw(404);
  }
  if (approval.get('createdById') !== currentUser.id) {
    return context.throw(403, 'Only applicant can withdraw');
  }
  if (approval.get('status') !== APPROVAL_STATUS.IN_PROGRESS) {
    return context.throw(400, 'Approval already finished, cannot withdraw');
  }

  // Abort the active workflow execution (if any) so its pending job is released.
  // approvalExecutions.executionId is the workflow engine execution id; pick the
  // round whose status is still null (suspended) — that is the active one.
  const ExecRepo = db.getRepository(APPROVAL_EXECUTION_COLLECTION);
  const activeExec = await ExecRepo.findOne({
    filter: { approvalId, status: null },
    sort: ['-createdAt'],
    context,
  });
  if (activeExec) {
    const executionId = activeExec.get('executionId');
    const ExecutionRepo = db.getRepository('executions');
    const execution = await ExecutionRepo.findOne({ filterByTk: executionId });
    if (execution && execution.status === EXECUTION_STATUS.STARTED) {
      await abortExecution(plugin, execution, { reason: EXECUTION_REASON.MANUAL_CANCEL });
    }
    // Mark this approval round as interrupted regardless of engine outcome.
    await ExecRepo.update({
      filterByTk: activeExec.get('id'),
      values: { status: APPROVAL_EXECUTION_STATUS.INTERRUPTED },
      context,
    });
  }

  // Invalidate any still-pending approver records for this approval.
  const RecordRepo = db.getRepository(APPROVAL_RECORD_COLLECTION);
  await RecordRepo.update({
    filter: { approvalId, status: APPROVAL_RECORD_STATUS.PENDING },
    values: { status: APPROVAL_RECORD_STATUS.INVALID },
    context,
  });

  // Finally, mark the approval itself as withdrawn.
  await ApprovalRepo.update({
    filterByTk: approvalId,
    values: { status: APPROVAL_STATUS.WITHDRAWN, updatedById: currentUser.id },
    context,
  });

  context.body = { id: approvalId };
  context.status = 202;
  await next();
}

/**
 * List the workflow nodes an approver can return to (§4.3 / backlog #6).
 *
 * Given a pending approvalRecord id, walks record → execution → workflow and
 * returns the upstream nodes (those declared before the current approval node)
 * as `{ key, title }` candidates. The current approval node's own key is always
 * the implicit option (it means "return here, applicant resubmits"); the picker
 * surfaces only earlier nodes when present, falling back to the current-node
 * default when the workflow has no upstream return targets.
 *
 * Only the record's assigned approver may call this (same guard as decide()).
 */
export async function returnableNodes(context: Context, next: () => Promise<void>) {
  const { filterByTk } = context.action.params;
  const { currentUser } = context.state;
  if (!currentUser) {
    return context.throw(401);
  }
  const db = context.db;
  const RecordRepo = db.getRepository(APPROVAL_RECORD_COLLECTION);
  const record = await RecordRepo.findOne({
    filterByTk,
    appends: ['node', 'workflow'],
    context,
  });
  if (!record) {
    return context.throw(404);
  }
  if (record.get('userId') !== currentUser.id) {
    return context.throw(403);
  }
  const node = record.get('node');
  const workflow = record.get('workflow');
  if (!workflow) {
    context.body = { data: [] };
    await next();
    return;
  }
  const FlowNodeRepo = db.getRepository('flowNodes');
  const allNodes = FlowNodeRepo
    ? ((await FlowNodeRepo.find({
        where: { workflowId: workflow.get('id') },
        order: [['createdAt', 'ASC']],
        context,
      })) as Array<{ get: (k: string) => unknown }>)
    : [];
  const currentNodeId = node?.get?.('id');
  // Upstream = every node before the current approval node, excluding other
  // approval nodes (returning to another pending approval node is ambiguous).
  const upstream = allNodes
    .filter((n) => {
      const id = n.get('id');
      const type = String(n.get('type') ?? '');
      return currentNodeId == null ? type !== INSTRUCTION_TYPE : String(id) !== String(currentNodeId);
    })
    .map((n) => ({ key: String(n.get('key') ?? ''), title: String(n.get('title') ?? '') }));
  context.body = { data: upstream };
  await next();
}
