/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Server plugin entry.
 *
 * Responsibilities:
 *  - Define the 6 approval collections (loaded automatically from collections/).
 *  - Register the `approvals` resource + ACL (submit/approve/reject/return/
 *    listMine + read-only list/get).
 *  - Register the approval trigger + instruction with the workflow plugin.
 *  - Register the `RelatedApprovals` polymorphic hasMany on each business
 *    collection that has approval workflows configured. This is the runtime
 *    association whose absence causes "Model class 'RelatedApprovalsModel' not
 *    found" when the 审批 tab queries it.
 *
 * RelatedApprovals semantics: for a business record R in collection C, the
 * associated approvals are rows in `approvals` where
 *   collectionName = C  AND  dataKey = R.id.
 * We attach this as a scoped hasMany so the record-detail "add block" picker
 * surfaces the 审批 tab automatically (core recordBlockInitializers).
 */

import { Plugin } from '@nocobase/server';
import WorkflowPlugin from '@nocobase/plugin-workflow';

import * as approvalActions from './actions';
import ApprovalTrigger from './ApprovalTrigger';
import ApprovalInstruction from './ApprovalInstruction';
import { seedDefaultMsgTpls } from './seedMsgTpls';
import {
  APPROVAL_COLLECTION,
  APPROVAL_MSG_TPL_COLLECTION,
  APPROVAL_RECORD_COLLECTION,
  TRIGGER_TYPE,
  INSTRUCTION_TYPE,
} from '../common/constants';

/** Business collections known to have approval workflows configured. */
const APPROVED_BUSINESS_COLLECTIONS = ['quotations', 'orders'];

export default class PluginWorkflowApprovalServer extends Plugin {
  async load() {
    // 1. Resource + ACL for the approvals API.
    this.app.resourceManager.define({
      name: APPROVAL_COLLECTION,
      actions: approvalActions,
    });
    this.app.acl.allow(APPROVAL_COLLECTION, ['list', 'get', 'listMine', 'listSubmitted'], 'loggedIn');

    // The `approvals` resource above carries listMine/listSubmitted via the
    // wildcard `import * as approvalActions`, but those actions run against the
    // resource they are invoked on. listMine filters approvalRecords by userId
    // (the approver's inbox) and is called by the client as
    // `api.resource('approvalRecords').listMine(...)`, so it must be reachable
    // on the approvalRecords resource. Define approvalRecords as a resource
    // exposing listMine (the collection itself is auto-defined by the db, so
    // only the action + ACL are needed).
    this.app.resourceManager.define({
      name: APPROVAL_RECORD_COLLECTION,
      actions: { listMine: approvalActions.listMine },
    });
    this.app.acl.allow(APPROVAL_RECORD_COLLECTION, ['listMine'], 'loggedIn');
    // submit/approve/reject/return/resubmit/withdraw require a logged-in user (finer ACL via snippets).
    this.app.acl.allow(
      APPROVAL_COLLECTION,
      ['submit', 'approve', 'reject', 'returnBack', 'resubmit', 'withdraw'],
      'loggedIn',
    );

    // 2. Register trigger + instruction with the workflow plugin.
    const workflowPlugin = this.app.pm.get(WorkflowPlugin) as WorkflowPlugin;
    workflowPlugin.registerTrigger(TRIGGER_TYPE, ApprovalTrigger);
    workflowPlugin.registerInstruction(INSTRUCTION_TYPE, new ApprovalInstruction(workflowPlugin));

    // 3. Expose a `relatedApprovals` association on each business collection so
    //    the record-detail 审批 tab can list an record's approvals. We attach a
    //    scoped hasMany (collectionName + dataKey) AND register a custom
    //    `list` action per business resource, because runtime-defined target
    //    collections have no metadata row and the default list action fails to
    //    resolve it. The custom action reads approvals directly.
    this.registerRelatedApprovals();
  }

  /**
   * Seed the default todo/done message templates (§2.6) on first install so
   * notifications work out of the box. Existing rows (including production data)
   * are never overwritten — we only insert when a given type is absent.
   */
  async install() {
    const Repo = this.app.db.getRepository(APPROVAL_MSG_TPL_COLLECTION);
    if (Repo) {
      await seedDefaultMsgTpls(Repo);
    }
  }

  /**
   * Expose each business record's approvals under a `relatedApprovals`
   * association so the record-detail 审批 tab works.
   *
   * Approach: register a custom `list` action handler named
   * `<collection>.relatedApprovals:list`. When a request hits
   * `/<collection>/:sourceId/relatedApprovals:list`, the resourcer resolves the
   * action name to `<collection>.relatedApprovals:list` and dispatches our
   * handler, which reads approvals directly by the polymorphic key
   * (collectionName + dataKey) via the approvals repository.
   */
  private registerRelatedApprovals() {
    for (const collectionName of APPROVED_BUSINESS_COLLECTIONS) {
      // Register a per-collection association action. The resourcer's getAction()
      // checks `${name}:${action}` before the default, so this handler wins for
      // the 审批 tab request.
      this.app.resourceManager.registerActionHandler(`${collectionName}.relatedApprovals:list`, async (ctx, next) => {
        // The source record id arrives under several param keys depending on how
        // the resourcer resolves the association route; read whichever is set.
        const sourceId =
          ctx.action.params.sourceId ??
          ctx.action.params.resourceOf ??
          ctx.action.params.associatedIndex ??
          ctx.action.params.resourceIndex;
        const page = Number(ctx.action.params.page ?? 1);
        const pageSize = Number(ctx.action.params.pageSize ?? 20);
        const Repo = ctx.db.getRepository(APPROVAL_COLLECTION);
        if (!Repo) {
          ctx.body = { data: [], meta: { count: 0, page, pageSize } };
          await next();
          return;
        }
        // Query approvals by the polymorphic key (collectionName + dataKey).
        const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20;
        const [rows, count] = await Repo.findAndCount({
          filter: { collectionName, dataKey: String(sourceId) },
          offset: (page - 1) * safePageSize,
          limit: safePageSize,
          sort: ['-createdAt'],
        });
        ctx.body = { data: rows, meta: { count, page, pageSize: safePageSize } };
        await next();
      });

      // Allow logged-in users to list related approvals.
      this.app.acl.allow(`${collectionName}.relatedApprovals`, ['list'], 'loggedIn');
    }
  }
}
