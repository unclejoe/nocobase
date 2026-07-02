/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * AudienceExpander — materialises the `approvalAudienceUsers` table (§4.7) from
 * `approvalAudiences`.
 *
 * `approvalAudiences` is the admin-facing scope config (one row per
 * workflow × type × targetKey, where type ∈ {user, role, department}).
 * `approvalAudienceUsers` is the flattened, queryable per-user expansion (one
 * row per workflow × userId, UNIQUE(workflowId, userId)) used by the visibility
 * filter.
 *
 * Expansion is the same role/department → userId lookup the ApproverResolver
 * performs, so it reuses {@link OrgUserResolver} to keep a single source of
 * truth. After expansion the workflow's rows in `approvalAudienceUsers` are
 * fully replaced (delete-then-insert in one pass), so removed audiences no
 * longer grant access.
 *
 * A workflow with NO configured audiences yields ZERO rows in
 * `approvalAudienceUsers`; the visibility layer treats that as "unrestricted"
 * (everyone can see) so historical/legacy workflows are not locked out (§5.1
 * compatibility). Only workflows that have at least one audience row are
 * considered restricted.
 */

import type { Database } from '@nocobase/database';
import { OrgUserResolver } from './ApproverResolver';
import {
  APPROVAL_AUDIENCE_COLLECTION,
  APPROVAL_AUDIENCE_TYPE,
  APPROVAL_AUDIENCE_USER_COLLECTION,
} from '../common/constants';

/** A single audience config row as read from approvalAudiences. */
export interface AudienceRow {
  workflowId: number | string;
  /** One of APPROVAL_AUDIENCE_TYPE. */
  type: string;
  /** The role/department/user identifier (string form as stored in targetKey). */
  targetKey: string;
}

export class AudienceExpander {
  private org: OrgUserResolver;

  constructor(private db: Database) {
    this.org = new OrgUserResolver(db);
  }

  /**
   * Compute the de-duplicated set of user ids an audience config expands to,
   * WITHOUT writing the database. Pure and easily unit-testable. Returns []
   * when the config is empty or only references missing entities.
   */
  async expandUserIds(audiences: AudienceRow[], transaction?: unknown): Promise<number[]> {
    const result = new Set<number>();
    for (const a of audiences) {
      const targetId = a.targetKey;
      let ids: number[] = [];
      if (a.type === APPROVAL_AUDIENCE_TYPE.USER) {
        ids = this.org.directUser(targetId);
      } else if (a.type === APPROVAL_AUDIENCE_TYPE.ROLE) {
        ids = await this.org.byRole(targetId, transaction);
      } else if (a.type === APPROVAL_AUDIENCE_TYPE.DEPARTMENT) {
        ids = await this.org.byDepartment(targetId, undefined, transaction);
      }
      for (const id of ids) {
        result.add(id);
      }
    }
    return Array.from(result).sort((x, y) => x - y);
  }

  /**
   * Materialise the expanded user list for a workflow into
   * `approvalAudienceUsers`, replacing any prior rows for that workflow.
   *
   * Returns the inserted user ids (handy for callers/tests). A no-op when the
   * audience collection or its repository is unavailable.
   */
  async expand(workflowId: number | string, transaction?: unknown): Promise<number[]> {
    const AudienceRepo = this.db.getRepository(APPROVAL_AUDIENCE_COLLECTION);
    const AudienceUserRepo = this.db.getRepository(APPROVAL_AUDIENCE_USER_COLLECTION);
    if (!AudienceRepo || !AudienceUserRepo) {
      return [];
    }

    const txOpts = transaction ? { transaction } : {};
    const rows = (await AudienceRepo.find({
      filter: { workflowId },
      ...txOpts,
    })) as Array<{ get: (k: string) => unknown }>;

    const audiences: AudienceRow[] = rows.map((r) => ({
      workflowId,
      type: String(r.get('type') ?? ''),
      targetKey: String(r.get('targetKey') ?? ''),
    }));

    const userIds = await this.expandUserIds(audiences, transaction);

    // Replace: remove old grants for this workflow, then insert the new set.
    await AudienceUserRepo.destroy({ filter: { workflowId }, ...txOpts });
    if (userIds.length) {
      await AudienceUserRepo.create({
        values: userIds.map((userId) => ({ workflowId, userId })),
        ...txOpts,
      });
    }
    return userIds;
  }

  /**
   * Whether a workflow is "restricted" (has at least one audience configured).
   * Unrestricted workflows are visible to everyone (§5.1 compatibility).
   */
  async isRestricted(workflowId: number | string): Promise<boolean> {
    const AudienceRepo = this.db.getRepository(APPROVAL_AUDIENCE_COLLECTION);
    if (!AudienceRepo) {
      return false;
    }
    const count = await AudienceRepo.count({ where: { workflowId } });
    return Number(count) > 0;
  }
}
