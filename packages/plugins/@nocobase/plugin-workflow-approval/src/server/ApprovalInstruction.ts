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

import PluginWorkflowServer, {
  Instruction,
  JOB_STATUS,
  Processor,
  type FlowNodeModel,
  type IJob,
} from '@nocobase/plugin-workflow';
import { ApproverResolver, type ApproverConfigItem } from './ApproverResolver';
import { renderNotification, type NotificationVars } from './MsgTplRenderer';
import {
  APPROVAL_EXECUTION_STATUS,
  APPROVAL_RECORD_STATUS,
  APPROVAL_RECORD_TYPE,
  APPROVAL_STATUS,
  APPROVAL_COLLECTION,
  APPROVAL_EXECUTION_COLLECTION,
  APPROVAL_RECORD_COLLECTION,
  APPROVAL_MSG_TYPE,
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

  constructor(workflow: PluginWorkflowServer) {
    super(workflow);
    this.resolver = new ApproverResolver(workflow.app.db);
  }

  async run(node: FlowNodeModel, prevJob: IJob | null, processor: Processor): Promise<IJob | null> {
    const config = (node.config || {}) as ApprovalNodeConfig;

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

    // Create one suspended execution row for this round. Each (re)submit is a
    // fresh workflow execution, so (approvalId, executionId) is unique per round.
    const ExecRepo = this.workflow.app.db.getRepository(APPROVAL_EXECUTION_COLLECTION);
    const execRow = await ExecRepo.create({
      values: {
        approvalId,
        executionId: job.executionId,
        status: null,
      },
    });

    // When this run is a resubmit (a new execution after a return), link the new
    // round's records to the previous round's records via prevRecordId, forming
    // the audit chain required by §8.3. The previous round's records were marked
    // INVALID by Instruction.resume() when the return was processed.
    const prevRecordId = await this.findPrevRoundRecordId(approvalId, job.executionId);

    // Field-level diff computed by the resubmit action (§4.2) and carried in the
    // trigger context. Null on the first round (no prior snapshot to diff).
    const changes = processor.execution?.context?.changes ?? null;

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
        prevRecordId: prevRecordId ?? null,
        changes,
      })),
    });

    // Best-effort todo notification to the approvers (§4.6). Renders the
    // approvalMsgTpls 'todo' template (falling back to a built-in default) and
    // sends via the notification-manager in-app-message channel if available;
    // degrades silently when the notification plugin is absent.
    await this.notify(approverIds, APPROVAL_MSG_TYPE.TODO, {
      approvalId,
      title,
      applicantId: applicantUserId,
    });

    return job;
  }

  /**
   * Find the most recent INVALID record from a prior round of this approval
   * (i.e. a record from a different execution that was invalidated by a return).
   * Used to chain a resubmit's new records back to the previous round (§8.3).
   * Returns null on the first round (no prior round exists).
   */
  private async findPrevRoundRecordId(
    approvalId: number | string | null,
    currentExecutionId: number | string,
  ): Promise<number | string | null> {
    if (approvalId == null) {
      return null;
    }
    const RecordRepo = this.workflow.app.db.getRepository(APPROVAL_RECORD_COLLECTION);
    // Look up the most recent INVALID record from a *different* execution round.
    // A previous version used `executionId: { $ne: currentExecutionId }`, but that
    // operator form crashed with "invalid input syntax for type bigint: [object Object]"
    // when currentExecutionId arrived as a non-primitive. Fetch prior INVALID rows
    // for this approval and exclude the current round in-memory — robust to type quirks.
    const currentId = String(currentExecutionId);
    let prev: { id: number | string; executionId?: unknown } | null = null;
    try {
      prev = await RecordRepo.findOne({
        where: {
          approvalId,
          status: APPROVAL_RECORD_STATUS.INVALID,
        },
        order: [['createdAt', 'DESC']],
      });
    } catch {
      return null;
    }
    if (!prev) {
      return null;
    }
    // Walk back to the most recent INVALID record that is NOT from the current round.
    // findOne already returns the latest; if it belongs to the current round there is no prior round.
    return String(prev.executionId ?? '') === currentId ? null : prev.id;
  }

  /**
   * Send a notification (todo or done) to a set of users. Renders the matching
   * approvalMsgTpls template (§2.6/§4.6) and dispatches via the
   * notification-manager in-app-message channel. Best-effort: never blocks the
   * approval flow on notification failures.
   */
  private async notify(recipientIds: number[], msgType: string, vars: NotificationVars): Promise<void> {
    if (!recipientIds.length) {
      return;
    }
    try {
      const message = await renderNotification(this.workflow.app.db, msgType, vars);
      // Lazy-require to avoid a hard dependency at plugin load time.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const NotificationsServerPlugin = require('@nocobase/plugin-notification-manager').default;
      const notificationServer = this.workflow.app.pm.get(NotificationsServerPlugin);
      if (!notificationServer || typeof notificationServer.send !== 'function') {
        return;
      }
      // Resolve the in-app channel by its notificationType. The previous code
      // hardcoded channelName:'in-app-message', but that is the channel *type*,
      // not a channel *name* (row name). notification-manager.sendNow() looks
      // channels up by name, so the bare type string never matched and the send
      // failed silently with reason "channel not found". Look up the real row.
      const channelRepo = this.workflow.app.db.getRepository('notificationChannels');
      const channel = channelRepo
        ? await channelRepo.findOne({ filter: { notificationType: 'in-app-message' } })
        : null;
      if (!channel) {
        // No in-app channel configured; nothing to deliver. Best-effort.
        return;
      }
      // Single send() call fans out to every recipient (the in-app channel
      // bulk-inserts one notificationInAppMessages row per userId). The prior
      // per-user loop with receivers: recipientIds sent N^2 messages.
      await notificationServer.send({
        channelName: channel.get('name'),
        message: {
          title: message.title,
          content: message.content,
          data: { approvalId: vars.approvalId },
          // The inbox client (MessageList) reads options.url: a leading "/"
          // navigates in-app; otherwise it treats it as an external URL.
          // Send approvers/applicant straight to the approval center. Use the
          // settings path because it renders cleanly under the admin layout
          // (the /admin/approvals/center v1 route gets a stray "Not Found" view
          // from the layout's 2-segment path resolver).
          options: { url: '/admin/settings/workflow-approval' },
        },
        receivers: { value: recipientIds, type: 'userId' },
        triggerFrom: 'workflow-approval',
      });
    } catch (err) {
      // Best-effort: never block the approval flow on a notification failure,
      // but log so a future regression doesn't fail silently again.
      this.workflow.app.log.warn('approval notification failed', { error: String((err as Error)?.message ?? err) });
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
      // Both a real reject and a return end this execution's job. A return keeps
      // the parent approval IN_PROGRESS (see below) so the applicant can
      // resubmit, which starts a fresh execution under the same approvals row.
      jobStatus = JOB_STATUS.REJECTED;
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

    if (jobStatus === JOB_STATUS.RESOLVED) {
      // Approved → finalize the approval.
      const ApprovalRepo = this.workflow.app.db.getRepository(APPROVAL_COLLECTION);
      await ApprovalRepo.update({
        filterByTk: approvalId,
        values: { status: APPROVAL_STATUS.FINISHED },
      });
      // Notify the applicant of the result (§4.6 done).
      await this.notifyApplicant(approvalId, 'approved', node.title);
    } else if (jobStatus === JOB_STATUS.REJECTED && !returnedRecord) {
      // A real reject finalizes the approval as finished. A return leaves the
      // approval IN_PROGRESS so the applicant can resubmit.
      const ApprovalRepo = this.workflow.app.db.getRepository(APPROVAL_COLLECTION);
      await ApprovalRepo.update({
        filterByTk: approvalId,
        values: { status: APPROVAL_STATUS.FINISHED },
      });
      // Notify the applicant of the rejection (§4.6 done).
      await this.notifyApplicant(approvalId, 'rejected', node.title);
    } else if (returnedRecord) {
      // A return notifies the applicant to modify and resubmit.
      await this.notifyApplicant(approvalId, 'returned', node.title);
    }

    job.set({ status: jobStatus });
    return job;
  }

  /**
   * Send a done/result notification to the approval's applicant. Resolves the
   * applicant id from the approvals row (createdById) and dispatches via the
   * generic notify() with the 'done' message type. Best-effort.
   */
  private async notifyApplicant(
    approvalId: number | string | null,
    outcome: string,
    title: string | undefined,
  ): Promise<void> {
    if (approvalId == null) {
      return;
    }
    try {
      const ApprovalRepo = this.workflow.app.db.getRepository(APPROVAL_COLLECTION);
      const approval = await ApprovalRepo.findOne({ filterByTk: approvalId });
      const applicantId = approval ? Number(approval.get('createdById')) : null;
      if (!applicantId) {
        return;
      }
      await this.notify([applicantId], APPROVAL_MSG_TYPE.DONE, {
        approvalId,
        title,
        status: outcome,
        applicantId,
      });
    } catch {
      // Best-effort: never block the flow on notification.
    }
  }
}
