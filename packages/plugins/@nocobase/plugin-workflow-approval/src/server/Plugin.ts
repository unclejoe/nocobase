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
import { APPROVAL_COLLECTION, TRIGGER_TYPE, INSTRUCTION_TYPE } from '../common/constants';

/** Business collections known to have approval workflows configured. */
const APPROVED_BUSINESS_COLLECTIONS = ['quotations', 'orders'];

export default class PluginWorkflowApprovalServer extends Plugin {
  async load() {
    // 1. Resource + ACL for the approvals API.
    this.app.resourceManager.define({
      name: APPROVAL_COLLECTION,
      actions: approvalActions,
    });
    this.app.acl.allow(APPROVAL_COLLECTION, ['list', 'get', 'listMine'], 'loggedIn');
    // submit/approve/reject/return require a logged-in user (finer ACL via snippets).
    this.app.acl.allow(APPROVAL_COLLECTION, ['submit', 'approve', 'reject', 'returnBack'], 'loggedIn');

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
   * Expose each business record's approvals under a `relatedApprovals`
   * association so the record-detail 审批 tab works.
   *
   * Approach: register a custom `list` action handler named
   * `<collection>.relatedApprovals:list`. When a request hits
   * `/<collection>/:sourceId/relatedApprovals:list`, the resourcer resolves the
   * action name to `<collection>.relatedApprovals:list` and dispatches our
   * handler (per Resourcer.getAction's "local action" lookup), which reads
   * approvals directly by the polymorphic key (collectionName + dataKey).
   *
   * We intentionally do NOT rely on a runtime `hasMany` association field: the
   * `approvals` target is a runtime-defined collection without a metadata row,
   * and the default list action's `db.getRepository(name, sourceId)` returns
   * undefined for it. A bespoke action avoids that entirely.
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
        const sequelize = ctx.db.sequelize;
        // Query approvals by the polymorphic key (collectionName + dataKey).
        // We escape the two scalar inputs and inline them into the query: the
        // runtime-defined approvals collection mis-resolves through the standard
        // repository filter path and through sequelize bind/replacement params
        // (both return 0 rows), while this raw path returns the correct rows.
        const escapeLiteral = (val: string) => `'${String(val).replace(/'/g, "''")}'`;
        const collLit = escapeLiteral(collectionName);
        const keyLit = escapeLiteral(String(sourceId));
        const limitLit = Number.isFinite(pageSize) ? pageSize : 20;
        const offsetLit = Number.isFinite((page - 1) * pageSize) ? (page - 1) * pageSize : 0;
        const [countRows] = await sequelize.query(
          `SELECT count(*)::int AS count FROM approvals WHERE "collectionName" = ${collLit} AND "dataKey" = ${keyLit}`,
        );
        const total = (countRows[0] as { count?: number })?.count ?? 0;
        const [rows] = await sequelize.query(
          `SELECT * FROM approvals WHERE "collectionName" = ${collLit} AND "dataKey" = ${keyLit} ORDER BY "createdAt" DESC LIMIT ${limitLit} OFFSET ${offsetLit}`,
        );
        ctx.body = {
          data: rows,
          meta: { count: total, page, pageSize },
        };
        await next();
      });

      // Allow logged-in users to list related approvals.
      this.app.acl.allow(`${collectionName}.relatedApprovals`, ['list'], 'loggedIn');
    }
  }
}
