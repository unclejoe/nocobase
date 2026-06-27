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
 */

import type { Database } from '@nocobase/database';
import { APPROVER_SOURCE } from '../common/constants';

export interface ApproverConfigItem {
  /** One of APPROVER_SOURCE. */
  source: string;
  /** Meaning depends on source: userId (user), roleId (role), departmentId (department). Ignored for supervisor. */
  targetId?: number | string;
  /** For department source: only count main members. */
  onlyMain?: boolean;
}

export class ApproverResolver {
  constructor(private db: Database) {}

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
        return item.targetId != null ? [item.targetId] : [];

      case APPROVER_SOURCE.ROLE:
        return this.resolveByRole(item.targetId);

      case APPROVER_SOURCE.DEPARTMENT:
        return this.resolveByDepartment(item.targetId, item.onlyMain);

      case APPROVER_SOURCE.SUPERVISOR:
        return this.resolveSupervisor(applicantUserId);

      default:
        return [];
    }
  }

  /** All users holding the given role (rolesUsers join). */
  private async resolveByRole(roleId: number | string | undefined): Promise<Array<number | string>> {
    if (roleId == null) {
      return [];
    }
    const RolesUsers = this.db.getRepository('rolesUsers');
    if (!RolesUsers) {
      return [];
    }
    const rows = await RolesUsers.find({
      where: { roleId },
      attributes: ['userId'],
    });
    return rows.map((r) => r.get('userId')).filter(Boolean);
  }

  /** All users in the given department (optionally only main members). */
  private async resolveByDepartment(
    departmentId: number | string | undefined,
    onlyMain?: boolean,
  ): Promise<Array<number | string>> {
    if (departmentId == null) {
      return [];
    }
    const DepartmentsUsers = this.db.getRepository('departmentsUsers');
    if (!DepartmentsUsers) {
      return [];
    }
    const where: Record<string, unknown> = { departmentId };
    if (onlyMain) {
      where.isMain = true;
    }
    const rows = await DepartmentsUsers.find({
      where,
      attributes: ['userId'],
    });
    return rows.map((r) => r.get('userId')).filter(Boolean);
  }

  /**
   * Direct supervisor: the owner (isOwner=true) of the applicant's main
   * department. Returns nothing if the applicant has no main department or
   * that department has no owner.
   */
  private async resolveSupervisor(
    applicantUserId: number | string | null | undefined,
  ): Promise<Array<number | string>> {
    if (applicantUserId == null) {
      return [];
    }
    const Users = this.db.getRepository('users');
    if (!Users) {
      return [];
    }
    const applicant = await Users.findOne({
      where: { id: applicantUserId },
      attributes: ['mainDepartmentId'],
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
      where: { departmentId: mainDeptId, isOwner: true },
      attributes: ['userId'],
    });
    return owners.map((r) => r.get('userId')).filter(Boolean);
  }
}
