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
import { AudienceExpander } from './AudienceExpander';
import { canViewApproval } from './visibility';
import {
  APPROVAL_AUDIENCE_COLLECTION,
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
    //    The custom `list` action wraps actions.list with audience visibility
    //    filtering (§4.7); the bare default would return everything.
    this.app.resourceManager.define({
      name: APPROVAL_COLLECTION,
      actions: { ...approvalActions, list: approvalActions.list },
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
      ['submit', 'approve', 'reject', 'returnBack', 'resubmit', 'withdraw', 'returnableNodes'],
      'loggedIn',
    );

    // 2. Register trigger + instruction with the workflow plugin.
    const workflowPlugin = this.app.pm.get(WorkflowPlugin) as WorkflowPlugin;
    workflowPlugin.registerTrigger(TRIGGER_TYPE, ApprovalTrigger);
    workflowPlugin.registerInstruction(INSTRUCTION_TYPE, new ApprovalInstruction(workflowPlugin));

    // 3. Expose a `relatedApprovals` association on each business collection so
    //    the record-detail 审批 tab can list an record's approvals.
    this.registerRelatedApprovals();

    // 4. Audience expansion hooks (§4.7): keep approvalAudienceUsers in sync
    //    with approvalAudiences. Re-expansion is triggered whenever an audience
    //    row changes, and whenever an approval workflow is saved (so that
    //    audiences configured in the trigger panel — synced into the table by
    //    the afterSave below — get materialised).
    this.registerAudienceHooks();
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
        const [allRows, count] = await Repo.findAndCount({
          filter: { collectionName, dataKey: String(sourceId) },
          offset: (page - 1) * safePageSize,
          limit: safePageSize,
          sort: ['-createdAt'],
        });
        // Apply audience visibility (§4.7): filter out approvals the current
        // user cannot view. Without audiences configured this is a no-op.
        const userId = ctx.state.currentUser?.id;
        const visible =
          userId != null
            ? await Promise.all(
                allRows.map((row) =>
                  canViewApproval(
                    ctx.db,
                    userId,
                    row.get('id') as number | string,
                    row.get('workflowId') as number | string | null,
                  ).then((ok) => (ok ? row : null)),
                ),
              ).then((xs) => xs.filter(Boolean))
            : allRows;
        ctx.body = {
          data: visible,
          meta: { count: userId != null ? visible.length : count, page, pageSize: safePageSize },
        };
        await next();
      });

      // Allow logged-in users to list related approvals.
      this.app.acl.allow(`${collectionName}.relatedApprovals`, ['list'], 'loggedIn');
    }
  }

  /**
   * Wire audience expansion triggers (§4.7):
   *  - On any approvalAudiences row change → re-expand that workflow.
   *  - On an approval workflow afterSave → sync the trigger panel's
   *    `config.audiences` into the approvalAudiences table (the trigger UI
   *    collects them as a config array; we mirror them into the table so the
   *    AudienceExpander + visibility layer has a single source of truth).
   *
   * Both hooks are best-effort and logged on failure — a stale expansion is
   * preferable to a failed request.
   */
  private registerAudienceHooks() {
    const db = this.app.db;
    const expander = new AudienceExpander(db);

    const reexpand = async (workflowId: number | string | null | undefined, transaction?: unknown) => {
      if (workflowId == null) {
        return;
      }
      try {
        await expander.expand(workflowId, transaction);
      } catch (err) {
        this.app.log.warn('approval audience expansion failed', {
          workflowId,
          error: String((err as Error)?.message ?? err),
        });
      }
    };

    // The (instance, options) signature: options carries the active transaction,
    // so expand() reads the just-saved row within the same tx (otherwise the new
    // row is invisible and expansion yields nothing on the creating request).
    db.on(
      `${APPROVAL_AUDIENCE_COLLECTION}.afterSave`,
      (instance: { get: (k: string) => unknown }, options?: { transaction?: unknown }) => {
        return reexpand(instance.get('workflowId') as number | string | null | undefined, options?.transaction);
      },
    );
    db.on(
      `${APPROVAL_AUDIENCE_COLLECTION}.afterDestroy`,
      (instance: { get: (k: string) => unknown }, options?: { transaction?: unknown }) => {
        return reexpand(instance.get('workflowId') as number | string | null | undefined, options?.transaction);
      },
    );

    // Sync trigger-panel config.audiences into the approvalAudiences table.
    // The panel collects an array of { type, targetKey }; we upsert matching
    // rows and remove any no-longer-present ones, then expansion runs via the
    // afterSave hook above.
    db.on('workflows.afterSave', async (instance: { get: (k: string) => unknown }) => {
      const type = String(instance.get('type') ?? '');
      if (type !== TRIGGER_TYPE) {
        return;
      }
      const config = (instance.get('config') ?? {}) as {
        audiences?: Array<{ type: string; targetKey: string | number }>;
      };
      const desired = Array.isArray(config.audiences) ? config.audiences : [];
      const workflowId = instance.get('id') as number | string;
      const AudienceRepo = db.getRepository(APPROVAL_AUDIENCE_COLLECTION);
      if (!AudienceRepo) {
        return;
      }
      try {
        const existing = (await AudienceRepo.find({
          where: { workflowId },
        })) as Array<{ get: (k: string) => unknown }>;
        const existingKeys = new Set(existing.map((r) => `${String(r.get('type'))}:${String(r.get('targetKey'))}`));
        const desiredKeys = new Set(desired.map((a) => `${String(a.type)}:${String(a.targetKey)}`));
        // Remove rows no longer configured.
        const stale = existing.filter(
          (r) => !desiredKeys.has(`${String(r.get('type'))}:${String(r.get('targetKey'))}`),
        );
        for (const r of stale) {
          await AudienceRepo.destroy({ filterByTk: r.get('id') });
        }
        // Insert newly-added rows.
        const toAdd = desired.filter((a) => !existingKeys.has(`${String(a.type)}:${String(a.targetKey)}`));
        if (toAdd.length) {
          await AudienceRepo.create({
            records: toAdd.map((a) => ({
              workflowId,
              type: String(a.type),
              targetKey: String(a.targetKey),
            })),
          });
        }
        // If nothing changed (no add/remove), still ensure expansion is current.
        if (!stale.length && !toAdd.length) {
          await reexpand(workflowId);
        }
      } catch (err) {
        this.app.log.warn('approval audience sync failed', {
          workflowId,
          error: String((err as Error)?.message ?? err),
        });
      }
    });
  }
}
