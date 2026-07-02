/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Approval visibility filter (§4.7).
 *
 * Visibility rule (agreed): a user U can view an approval A iff
 *   - A's workflow is UNRESTRICTED (no audiences configured) — the default,
 *     legacy-compatible case; OR
 *   - U is a member of A's workflow's audience (expanded in
 *     approvalAudienceUsers); OR
 *   - U is the applicant (approvals.createdById === U); OR
 *   - U is a current/ever approver of A (an approvalRecords row with
 *     userId === U exists).
 *
 * The applicant + current-approver branches ensure users always see their own
 * active involvement even when the workflow's audience was not configured to
 * include them — matching the requirement's "三类可见" choice.
 */

import type { Database } from '@nocobase/database';
import {
  APPROVAL_AUDIENCE_COLLECTION,
  APPROVAL_AUDIENCE_USER_COLLECTION,
  APPROVAL_COLLECTION,
  APPROVAL_RECORD_COLLECTION,
} from '../common/constants';

/**
 * Compute the workflow ids that are restricted (have ≥1 audience row), and the
 * subset of those the user is a member of. Returns null when no workflows are
 * restricted (nothing to filter). The result is the negative list — the user is
 * DENIED the difference (restricted − member).
 */
export async function resolveAudienceScope(
  db: Database,
  userId: number | string,
): Promise<{ restricted: Array<number | string>; memberOf: Array<number | string> } | null> {
  const AudienceRepo = db.getRepository(APPROVAL_AUDIENCE_COLLECTION);
  const AudienceUserRepo = db.getRepository(APPROVAL_AUDIENCE_USER_COLLECTION);
  if (!AudienceRepo || !AudienceUserRepo) {
    return null;
  }
  // All workflows that have at least one audience configured.
  const restrictedRows = (await AudienceRepo.find({
    attributes: ['workflowId'],
    group: ['workflowId'],
  })) as Array<{ get: (k: string) => unknown }>;
  const restricted = restrictedRows.map((r) => r.get('workflowId')).filter((x) => x != null);
  if (restricted.length === 0) {
    return null;
  }
  // Which of those the user is a member of.
  const memberRows = (await AudienceUserRepo.find({
    where: { userId },
    attributes: ['workflowId'],
  })) as Array<{ get: (k: string) => unknown }>;
  const memberOf = memberRows.map((r) => r.get('workflowId')).filter((x) => x != null);
  return { restricted, memberOf };
}

/**
 * Approval ids the user is a direct participant in (as applicant or approver),
 * regardless of audience. Used to let applicants/active approvers see their own
 * approvals even on restricted workflows.
 */
export async function resolveParticipatedApprovalIds(
  db: Database,
  userId: number | string,
): Promise<Array<number | string>> {
  const ids = new Set<number | string>();
  // As applicant.
  const ApprovalRepo = db.getRepository(APPROVAL_COLLECTION);
  if (ApprovalRepo) {
    const mine = (await ApprovalRepo.find({
      where: { createdById: userId },
      attributes: ['id'],
    })) as Array<{ get: (k: string) => unknown }>;
    for (const r of mine) {
      ids.add(r.get('id') as number | string);
    }
  }
  // As approver (current or past).
  const RecordRepo = db.getRepository(APPROVAL_RECORD_COLLECTION);
  if (RecordRepo) {
    const asApprover = (await RecordRepo.find({
      where: { userId },
      attributes: ['approvalId'],
    })) as Array<{ get: (k: string) => unknown }>;
    for (const r of asApprover) {
      ids.add(r.get('approvalId') as number | string);
    }
  }
  return Array.from(ids);
}

/**
 * Build a NocoBase/Sequelize-style `filter` for the `approvals` collection that
 * enforces the visibility rule above. Returns null when no filtering is needed
 * (user can see everything — e.g. when no workflow is restricted).
 *
 * The produced filter is an OR of:
 *   { workflowId: { $notIn: restricted } }                 // unrestricted
 *   { workflowId: { $in: memberOf } }                       // audience member
 *   { id: { $in: participatedApprovalIds } }                // applicant/approver
 *
 * Note: `$notIn` on restricted makes every unrestricted workflow visible and
 * excludes only restricted-non-member workflows — the intended default.
 */
export async function buildApprovalVisibilityFilter(
  db: Database,
  userId: number | string | null | undefined,
): Promise<Record<string, unknown> | null> {
  if (userId == null) {
    return null;
  }
  const scope = await resolveAudienceScope(db, userId);
  if (!scope) {
    return null;
  }
  const { restricted, memberOf } = scope;
  const or: Record<string, unknown>[] = [{ workflowId: { $notIn: restricted } }];
  if (memberOf.length) {
    or.push({ workflowId: { $in: memberOf } });
  }
  const participated = await resolveParticipatedApprovalIds(db, userId);
  if (participated.length) {
    or.push({ id: { $in: participated } });
  }
  return { $or: or };
}

/**
 * Check whether a single approval id is visible to the user. Used by the
 * `relatedApprovals:list` handler (which fetches approvals by collection+dataKey
 * directly, so a filter on the list query is awkward — instead we check each
 * row's visibility in memory).
 */
export async function canViewApproval(
  db: Database,
  userId: number | string | null | undefined,
  approvalId: number | string,
  workflowId: number | string | null | undefined,
): Promise<boolean> {
  if (userId == null) {
    return false;
  }
  const scope = await resolveAudienceScope(db, userId);
  if (!scope) {
    return true; // no restricted workflows at all
  }
  // Workflow unrestricted → visible.
  if (workflowId != null && !scope.restricted.some((w) => String(w) === String(workflowId))) {
    return true;
  }
  // User is an audience member of this workflow.
  if (workflowId != null && scope.memberOf.some((w) => String(w) === String(workflowId))) {
    return true;
  }
  // User is applicant or approver of this approval.
  const participated = await resolveParticipatedApprovalIds(db, userId);
  return participated.some((a) => String(a) === String(approvalId));
}
