/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * End-to-end integration test for the approval flow (§8.3, §8.4).
 *
 * Drives the full closed loop on a real mocked Application:
 *   submit → returnBack → resubmit → approve → done
 *
 * Loads the approval plugin alongside the workflow plugin via getApp(). The
 * notification-manager plugin is intentionally NOT loaded; the instruction's
 * notify() is best-effort and degrades silently, so this test asserts only the
 * approval data-model transitions (approvals / approvalRecords /
 * approvalExecutions) and workflow execution status.
 *
 * Run: yarn test packages/plugins/@nocobase/plugin-workflow-approval/src/server/__tests__/e2e-approval-flow.test.ts --run
 */

import { MockDatabase } from '@nocobase/database';
import { getApp, sleep } from '@nocobase/plugin-workflow-test';
import { MockServer } from '@nocobase/test';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  APPROVAL_COLLECTION,
  APPROVAL_EXECUTION_COLLECTION,
  APPROVAL_EXECUTION_STATUS,
  APPROVAL_RECORD_COLLECTION,
  APPROVAL_RECORD_STATUS,
  APPROVAL_STATUS,
  INSTRUCTION_TYPE,
  TRIGGER_TYPE,
} from '../../common/constants';

describe('approval flow > e2e (submit → return → resubmit → approve)', () => {
  let app: MockServer;
  let db: MockDatabase;
  let applicant: { id: number; token: string };
  let approver: { id: number; token: string };
  let workflowId: number | string;
  let quoteId: number | string;

  beforeEach(async () => {
    app = await getApp({
      plugins: ['@nocobase/plugin-workflow-approval'],
    });
    db = app.db;

    // A minimal business collection to be the approval subject.
    const QuoteRepo = db.getRepository('quotes');
    if (!QuoteRepo) {
      // Define it on the fly (mock server auto-syncs).
      db.collection({
        name: 'quotes',
        fields: [
          { type: 'string', name: 'title' },
          { type: 'float', name: 'amount' },
        ],
      });
      await db.sync();
    }
    const quote = await db.getRepository('quotes').create({ values: { title: 'Q-1', amount: 1000 } });
    quoteId = quote.get('id');

    // Two users: applicant (daniel) and approver (zhoudan).
    const UserRepo = db.getRepository('users');
    const daniel = await UserRepo.create({ values: { username: 'daniel' } });
    const zhoudan = await UserRepo.create({ values: { username: 'zhoudan' } });
    applicant = { id: daniel.get('id'), token: '' };
    approver = { id: zhoudan.get('id'), token: '' };

    // Build the approval workflow: trigger (approval, collection=quotes) + one
    // approval instruction node whose assignee is the approver.
    const WorkflowModel = db.getCollection('workflows').model;
    const FlowNodeModel = db.getCollection('flowNodes').model;
    const workflow = await WorkflowModel.create({
      enabled: true,
      type: TRIGGER_TYPE,
      config: { collection: 'quotes' },
    });
    workflowId = workflow.get('id');
    await FlowNodeModel.create({
      workflowId,
      type: INSTRUCTION_TYPE,
      title: 'Approve',
      // single-approver, assignee = zhoudan
      config: { assignees: [{ source: 'user', targetId: approver.id }], mode: 0, title: 'Approve' },
      upstreamId: null,
    });

    // Allow submit/approve/etc. without fine-grained snippets in the mock app.
    app.acl.allow(
      APPROVAL_COLLECTION,
      ['submit', 'approve', 'reject', 'returnBack', 'resubmit', 'withdraw'],
      'loggedIn',
    );
    app.acl.allow(APPROVAL_RECORD_COLLECTION, ['listMine'], 'loggedIn');

    // Log in both users to obtain auth tokens for agent calls.
    applicant.token = (await app.agent().login(daniel)).token ?? '';
    approver.token = (await app.agent().login(zhoudan)).token ?? '';
  });

  afterEach(async () => {
    if (app) {
      await app.destroy();
    }
  });

  it('runs the full submit→return→resubmit→approve closed loop', async () => {
    // --- 1. Applicant submits ---
    const applicantAgent = app.agent().set('Authorization', `Bearer ${applicant.token}`);
    const submitResp = await applicantAgent.resource(APPROVAL_COLLECTION).submit({
      values: { collection: 'quotes', dataKey: quoteId, workflowId },
    });
    expect(submitResp.status).toBe(202);
    const approvalId = submitResp.body.id;
    expect(approvalId).toBeTruthy();

    // Let the workflow reach the approval node (async).
    await sleep(500);

    const ApprovalRepo = db.getRepository(APPROVAL_COLLECTION);
    const RecordRepo = db.getRepository(APPROVAL_RECORD_COLLECTION);
    const ExecRepo = db.getRepository(APPROVAL_EXECUTION_COLLECTION);

    const approval = await ApprovalRepo.findOne({ filterByTk: approvalId });
    expect(approval.get('status')).toBe(APPROVAL_STATUS.IN_PROGRESS);

    // One pending record for the approver.
    const pending = await RecordRepo.findOne({ filter: { approvalId, userId: approver.id } });
    expect(pending).toBeTruthy();
    expect(pending.get('status')).toBe(APPROVAL_RECORD_STATUS.PENDING);
    const recordId = pending.get('id');

    // An approval execution row exists, suspended (status null).
    const exec1 = await ExecRepo.findOne({ filter: { approvalId } });
    expect(exec1).toBeTruthy();

    // --- 2. Approver returns ---
    const approverAgent = app.agent().set('Authorization', `Bearer ${approver.token}`);
    await approverAgent.resource(APPROVAL_COLLECTION).returnBack({
      filterByTk: recordId,
      values: { comment: 'discount too high', returnToNodeKey: 'draft' },
    });
    await sleep(500);

    const afterReturn = await ApprovalRepo.findOne({ filterByTk: approvalId });
    // Returned → approval stays IN_PROGRESS (applicant may resubmit).
    expect(afterReturn.get('status')).toBe(APPROVAL_STATUS.IN_PROGRESS);

    const returnedRecord = await RecordRepo.findOne({ filterByTk: recordId });
    expect(returnedRecord.get('status')).toBe(APPROVAL_RECORD_STATUS.INVALID);
    expect(returnedRecord.get('returnToNodeKey')).toBe('draft');

    // --- 3. Applicant resubmits ---
    await applicantAgent.resource(APPROVAL_COLLECTION).resubmit({ filterByTk: approvalId });
    await sleep(500);

    // A NEW execution round and a new pending record for the approver, linked
    // to the previous round via prevRecordId (§8.3 audit chain).
    const allExecs = await ExecRepo.find({ filter: { approvalId } });
    expect(allExecs.length).toBeGreaterThanOrEqual(2);

    const newPending = await RecordRepo.findOne({
      filter: { approvalId, userId: approver.id, status: APPROVAL_RECORD_STATUS.PENDING },
    });
    expect(newPending).toBeTruthy();
    // The new round's record links back to the returned (invalidated) record.
    expect(String(newPending.get('prevRecordId') ?? '')).toBe(String(recordId));

    // --- 4. Approver approves ---
    await approverAgent
      .resource(APPROVAL_COLLECTION)
      .approve({ filterByTk: newPending.get('id'), values: { comment: 'ok' } });
    await sleep(500);

    const afterApprove = await ApprovalRepo.findOne({ filterByTk: approvalId });
    expect(afterApprove.get('status')).toBe(APPROVAL_STATUS.FINISHED);

    const successExec = await ExecRepo.findOne({
      filter: { approvalId, status: APPROVAL_EXECUTION_STATUS.SUCCESS },
    });
    expect(successExec).toBeTruthy();
  }, 30000);
});
