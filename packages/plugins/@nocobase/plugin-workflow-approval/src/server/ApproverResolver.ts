/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * ApproverResolver — resolves the concrete user ids that must approve a given
 * approval, based on the approval node's approver configuration.
 *
 * Supports four approver sources (APPROVER_SOURCE):
 *   - user:       directly specified user ids
 *   - role:       all users holding a given role (via rolesUsers)
 *   - department: all users in a given department (via departmentsUsers)
 *   - supervisor: the owner (isOwner=true) of the applicant's main department
 *
 * Resolution is read-only against the org data. When a source cannot be
 * resolved (e.g. the department has no owner, or a referenced role is gone),
 * that source contributes nothing — we do NOT guess. Callers decide whether
 * an empty result is an error (see ApprovalInstruction.run).
 *
 * The role/department → userId expansion is shared with the audience feature
 * (§4.7); it lives in {@link OrgUserResolver} below so both ApproverResolver
 * and AudienceExpander reuse one implementation.
 */

import type { Database } from '@nocobase/database';
import { APPROVER_SOURCE } from '../common/constants';

export interface ApproverConfigItem {
  /** One of APPROVER_SOURCE. */
  source: string;
  /** Meaning depends on source: userId (user), roleName (role, the string `name`), departmentId (department). Ignored for supervisor. */
  targetId?: number | string;
  /** For department source: only count main members. */
  onlyMain?: boolean;
}

/**
 * OrgUserResolver — shared read-only org-data → userId expansion.
 *
 * Used by both ApproverResolver (approver sources) and AudienceExpander
 * (audience sources). Both map role/department kinds to concrete user ids via
 * the same repository queries, so the logic is centralised here to avoid
 * divergence. All methods return [] when the referenced entity is gone or the
 * repository is absent — callers decide whether empty is an error.
 */
export class OrgUserResolver {
  constructor(private db: Database) {}

  /** A directly-specified user id (passthrough, normalised to a number). */
  directUser(targetId: number | string | undefined): number[] {
    return targetId != null ? [Number(targetId)] : [];
  }

  /** All users holding the given role (rolesUsers join). */
  async byRole(roleName: number | string | undefined, transaction?: unknown): Promise<number[]> {
    if (roleName == null) {
      return [];
    }
    const RolesUsers = this.db.getRepository('rolesUsers');
    if (!RolesUsers) {
      return [];
    }
    // NocoBase's rolesUsers join table keys on `roleName` (the roles table PK is
    // the string `name`, not an id). The client selectors already pass role.name
    // as the target, so query by roleName here.
    const rows = await RolesUsers.find({
      filter: { roleName },
      attributes: ['userId'],
      ...(transaction ? { transaction } : {}),
    });
    return rows.map((r) => r.get('userId')).filter(Boolean) as number[];
  }

  /** All users in the given department (optionally only main members). */
  async byDepartment(
    departmentId: number | string | undefined,
    onlyMain?: boolean,
    transaction?: unknown,
  ): Promise<number[]> {
    if (departmentId == null) {
      return [];
    }
    const DepartmentsUsers = this.db.getRepository('departmentsUsers');
    if (!DepartmentsUsers) {
      return [];
    }
    const filter: Record<string, unknown> = { departmentId };
    if (onlyMain) {
      filter.isMain = true;
    }
    const rows = await DepartmentsUsers.find({
      filter,
      attributes: ['userId'],
      ...(transaction ? { transaction } : {}),
    });
    return rows.map((r) => r.get('userId')).filter(Boolean) as number[];
  }

  /**
   * Direct supervisor: the owner (isOwner=true) of the applicant's main
   * department. Returns nothing if the applicant has no main department or
   * that department has no owner.
   */
  async supervisorOf(applicantUserId: number | string | null | undefined, transaction?: unknown): Promise<number[]> {
    if (applicantUserId == null) {
      return [];
    }
    const Users = this.db.getRepository('users');
    if (!Users) {
      return [];
    }
    const applicant = await Users.findOne({
      filter: { id: applicantUserId },
      attributes: ['mainDepartmentId'],
      ...(transaction ? { transaction } : {}),
    });
    const mainDeptId = applicant?.get('mainDepartmentId');
    if (mainDeptId == null) {
      return [];
    }
    const DepartmentsUsers = this.db.getRepository('departmentsUsers');
    if (!DepartmentsUsers) {
      return [];
    }
    const owners = await DepartmentsUsers.find({
      filter: { departmentId: mainDeptId, isOwner: true },
      attributes: ['userId'],
      ...(transaction ? { transaction } : {}),
    });
    return owners.map((r) => r.get('userId')).filter(Boolean) as number[];
  }
}

export class ApproverResolver {
  private org: OrgUserResolver;

  constructor(db: Database) {
    this.org = new OrgUserResolver(db);
  }

  /**
   * Resolve all configured approver sources to a de-duplicated list of user ids.
   * @param config  approver source config items
   * @param applicantUserId  the submitting user (needed for supervisor lookup)
   */
  async resolve(config: ApproverConfigItem[], applicantUserId: number | string | null | undefined): Promise<number[]> {
    if (!Array.isArray(config) || config.length === 0) {
      return [];
    }

    const result = new Set<number | string>();

    for (const item of config) {
      const ids = await this.resolveOne(item, applicantUserId);
      for (const id of ids) {
        // Exclude the applicant from their own approver set (a user should
        // not approve their own request).
        if (applicantUserId != null && String(id) === String(applicantUserId)) {
          continue;
        }
        result.add(id as number);
      }
    }

    return Array.from(result) as number[];
  }

  private async resolveOne(
    item: ApproverConfigItem,
    applicantUserId: number | string | null | undefined,
  ): Promise<Array<number | string>> {
    switch (item.source) {
      case APPROVER_SOURCE.USER:
        return this.org.directUser(item.targetId);

      case APPROVER_SOURCE.ROLE:
        return this.org.byRole(item.targetId);

      case APPROVER_SOURCE.DEPARTMENT:
        return this.org.byDepartment(item.targetId, item.onlyMain);

      case APPROVER_SOURCE.SUPERVISOR:
        return this.org.supervisorOf(applicantUserId);

      default:
        return [];
    }
  }
}
