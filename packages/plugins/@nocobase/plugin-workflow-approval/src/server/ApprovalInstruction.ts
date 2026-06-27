/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * ApprovalInstruction — the workflow "Approval" node.
 *
 * On `run`: resolve approvers (ApproverResolver), create an approvalExecutions
 * row (suspended) and one approvalRecords row per approver (pending), then
 * return a PENDING job to suspend the workflow.
 *
 * On `resume`: aggregate the approver records by countersign mode and decide
 * whether to continue (all/any approved), reject, or keep pending.
 *
 * Mirrors plugin-workflow-manual's ManualInstruction structure for the
 * PENDING-job + resume pattern, adapted to the approval data model.
 */

import { Instruction, JOB_STATUS, Processor, type FlowNodeModel, type IJob } from '@nocobase/plugin-workflow';
import { ApproverResolver, type ApproverConfigItem } from './ApproverResolver';
import {
  APPROVAL_EXECUTION_STATUS,
  APPROVAL_RECORD_STATUS,
  APPROVAL_RECORD_TYPE,
  APPROVAL_STATUS,
  APPROVAL_COLLECTION,
  APPROVAL_EXECUTION_COLLECTION,
  APPROVAL_RECORD_COLLECTION,
} from '../common/constants';

export interface ApprovalNodeConfig {
  /** Approver source configuration consumed by ApproverResolver. */
  assignees?: ApproverConfigItem[];
  /** Countersign mode (mirrors manual): ALL=1, ANY=-1, SINGLE=0. */
  mode?: number;
  title?: string;
}

const MULTIPLE_ASSIGNED_MODE = {
  SINGLE: Symbol('single'),
  ALL: Symbol('all'),
  ANY: Symbol('any'),
};

function getMode(mode: number | undefined) {
  if (mode === 1) return MULTIPLE_ASSIGNED_MODE.ALL;
  if (mode === -1) return MULTIPLE_ASSIGNED_MODE.ANY;
  return MULTIPLE_ASSIGNED_MODE.SINGLE;
}

/**
 * Decide the aggregate job status from the per-approver record distribution.
 * Returns null when the decision is still pending (not enough responses).
 */
function getAggregateStatus(
  mode: ReturnType<typeof getMode>,
  distribution: { status: number; count: number }[],
  approverCount: number,
): number | null {
  if (mode === MULTIPLE_ASSIGNED_MODE.SINGLE) {
    const done = distribution.find((d) => d.status !== APPROVAL_RECORD_STATUS.PENDING && d.count > 0);
    return done ? done.status : null;
  }
  if (mode === MULTIPLE_ASSIGNED_MODE.ALL) {
    // All approved → resolved; any rejected → rejected; otherwise pending.
    const approved = distribution.find((d) => d.status === APPROVAL_RECORD_STATUS.APPROVED);
    if (approved && approved.count === approverCount) return APPROVAL_RECORD_STATUS.APPROVED;
    const rejected = distribution.find((d) => d.status < APPROVAL_RECORD_STATUS.PENDING);
    if (rejected && rejected.count > 0) return rejected.status;
    return null;
  }
  // ANY: any approval resolves; all must reject to reject.
  const approvedAny = distribution.find((d) => d.status === APPROVAL_RECORD_STATUS.APPROVED);
  if (approvedAny && approvedAny.count > 0) return APPROVAL_RECORD_STATUS.APPROVED;
  const rejectedCount = distribution.reduce(
    (sum, d) => (d.status < APPROVAL_RECORD_STATUS.PENDING ? sum + d.count : sum),
    0,
  );
  if (rejectedCount === approverCount) return JOB_STATUS.REJECTED;
  return null;
}

export default class ApprovalInstruction extends Instruction {
  private resolver: ApproverResolver;

  constructor(
    workflow: Parameters<ConstructorParameters<typeof Instruction>[0]>[0] & {
      app: { db: import('@nocobase/database').Database };
    },
  ) {
    // @ts-expect-error — Instruction constructor expects the workflow plugin
    super(workflow);
    this.resolver = new ApproverResolver(workflow.app.db);
  }

  async run(node: FlowNodeModel, prevJob: IJob | null, processor: Processor): Promise<IJob | null> {
    const config = (node.config || {}) as ApprovalNodeConfig;
    const mode = getMode(config.mode);

    // Resolve approver user ids from the trigger context (applicant = createdBy
    // of the approval, available via the processor scope).
    const applicantUserId = processor.execution?.context?.user?.id ?? processor.execution?.context?.userId ?? null;
    const approverIds = await this.resolver.resolve(config.assignees ?? [], applicantUserId);

    // The approval id travels in the trigger payload (set by ApprovalTrigger).
    const approvalId = processor.execution?.context?.approvalId ?? null;

    const job = processor.saveJob({
      status: approverIds.length ? JOB_STATUS.PENDING : JOB_STATUS.RESOLVED,
      result: config.mode ? [] : null,
      nodeId: node.id,
      nodeKey: node.key,
      upstreamId: prevJob?.id ?? null,
    });

    if (!approverIds.length) {
      return job;
    }

    const title = config.title ? processor.getParsedValue(config.title, node.id) : node.title;

    // Create one suspended execution row for this round.
    const ExecRepo = this.workflow.app.db.getRepository(APPROVAL_EXECUTION_COLLECTION);
    const execRow = await ExecRepo.create({
      values: {
        approvalId,
        executionId: job.executionId,
        status: null,
      },
    });

    // Create one pending record per approver.
    const RecordRepo = this.workflow.app.db.getRepository(APPROVAL_RECORD_COLLECTION);
    await RecordRepo.createMany({
      records: approverIds.map((userId, index) => ({
        approvalId,
        approvalExecutionId: execRow.get('id'),
        userId,
        jobId: job.id,
        executionId: job.executionId,
        nodeId: node.id,
        workflowId: node.workflowId,
        index,
        title,
        status: APPROVAL_RECORD_STATUS.PENDING,
        type: APPROVAL_RECORD_TYPE.NORMAL,
      })),
    });

    // Best-effort todo notification to the approvers (§4.6). Uses the
    // notification-manager plugin's in-app-message channel if available; degrades
    // silently when the notification plugin is absent or has no channel configured.
    void this.notifyApprovers(approverIds, title, approvalId);

    return job;
  }

  /** Send a todo notification to each approver (best-effort, non-blocking). */
  private async notifyApprovers(
    approverIds: number[],
    title: string | undefined,
    approvalId: number | string | null,
  ): Promise<void> {
    if (!approverIds.length) {
      return;
    }
    try {
      // Lazy-require to avoid a hard dependency at plugin load time.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const NotificationsServerPlugin = require('@nocobase/plugin-notification-manager').default;
      const notificationServer = this.workflow.app.pm.get(NotificationsServerPlugin);
      if (!notificationServer || typeof notificationServer.send !== 'function') {
        return;
      }
      for (const userId of approverIds) {
        await notificationServer.send({
          channelName: 'in-app-message',
          message: {
            title: title || 'Approval todo',
            content: 'You have a pending approval request.',
            recipientId: userId,
            data: { approvalId },
          },
          triggerFrom: 'workflow-approval',
        });
      }
    } catch {
      // Notification is best-effort; never block the approval flow on it.
    }
  }

  async resume(node: FlowNodeModel, job: IJob, processor: Processor): Promise<IJob | null> {
    const config = (node.config || {}) as ApprovalNodeConfig;
    const mode = getMode(config.mode);

    const RecordRepo = this.workflow.app.db.getRepository(APPROVAL_RECORD_COLLECTION);
    const records = await RecordRepo.find({
      where: { jobId: job.id },
    });

    const approverIds: number[] = [];
    const distributionMap: Record<number, number> = {};
    for (const r of records) {
      const status = Number(r.get('status'));
      distributionMap[status] = (distributionMap[status] ?? 0) + 1;
      approverIds.push(r.get('userId'));
    }
    const distribution = Object.entries(distributionMap).map(([status, count]) => ({
      status: Number(status),
      count,
    }));

    const status = job.status || (getAggregateStatus(mode, distribution, approverIds.length) ?? JOB_STATUS.PENDING);

    // Detect a return decision: any record carries a returnToNodeKey and was
    // invalidated (the return action sets status=INVALID + returnToNodeKey).
    const returnedRecord = records.find(
      (r) => r.get('status') === APPROVAL_RECORD_STATUS.INVALID && r.get('returnToNodeKey'),
    );

    // Map the approval record status to a workflow job status.
    let jobStatus = status;
    if (status === APPROVAL_RECORD_STATUS.APPROVED) {
      jobStatus = JOB_STATUS.RESOLVED;
    } else if (status < APPROVAL_RECORD_STATUS.PENDING) {
      // A return is not a hard reject — keep the job pending so the workflow
      // can route back; a real reject (no returnToNodeKey) rejects.
      jobStatus = returnedRecord ? JOB_STATUS.PENDING : JOB_STATUS.REJECTED;
    }

    const approvalId = processor.execution?.context?.approvalId;

    // Update the suspended execution row to reflect this round's outcome.
    const ExecRepo = this.workflow.app.db.getRepository(APPROVAL_EXECUTION_COLLECTION);
    await ExecRepo.update({
      values: {
        status:
          jobStatus === JOB_STATUS.RESOLVED
            ? APPROVAL_EXECUTION_STATUS.SUCCESS
            : jobStatus < JOB_STATUS.PENDING
              ? APPROVAL_EXECUTION_STATUS.INTERRUPTED
              : null,
      },
      where: { approvalId, executionId: job.executionId },
    });

    // On resolve/reject, finalize the parent approval's status.
    if (jobStatus === JOB_STATUS.RESOLVED || jobStatus === JOB_STATUS.REJECTED) {
      const ApprovalRepo = this.workflow.app.db.getRepository(APPROVAL_COLLECTION);
      await ApprovalRepo.update({
        filterByTk: approvalId,
        values: { status: APPROVAL_STATUS.FINISHED },
      });
    }

    // Link this round's records to the previous round via prevRecordId when a
    // return happened (the audit chain). The actual job-status for a return
    // stays PENDING so the workflow engine routes to returnToNodeKey.
    if (returnedRecord) {
      const prevRound = await RecordRepo.findOne({
        where: { approvalId, id: { $ne: record_id(records, returnedRecord) } },
        order: [['createdAt', 'DESC']],
      });
      if (prevRound) {
        await returnedRecord.update({ prevRecordId: prevRound.get('id') });
      }
    }

    job.set({ status: jobStatus });
    return job;
  }
}

function record_id(records: any[], target: any): number | string {
  return target.get('id');
}
