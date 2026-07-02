/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Unit tests for AudienceExpander (§4.7).
 *
 * Covers the pure expansion logic (user/role/department → userIds,
 * de-duplication, empty config) via the table-less `expandUserIds` method so no
 * database is needed. The `expand()` write-path and `isRestricted()` are thin
 * wrappers over repository calls already exercised by the org-resolver tests.
 */

import { describe, expect, it } from 'vitest';
import { AudienceExpander } from '../AudienceExpander';
import { APPROVAL_AUDIENCE_TYPE } from '../../common/constants';

/** Build a fake Database whose OrgUserResolver repositories return canned rows. */
function makeDb(repos: Record<string, { find: (q: any) => Promise<any[]> }>) {
  return {
    getRepository(name: string) {
      return repos[name] ?? null;
    },
  } as any;
}

describe('AudienceExpander', () => {
  it('expands a directly-specified user', async () => {
    const expander = new AudienceExpander(makeDb({}));
    const ids = await expander.expandUserIds([{ workflowId: 1, type: APPROVAL_AUDIENCE_TYPE.USER, targetKey: '42' }]);
    expect(ids).toEqual([42]);
  });

  it('expands a role to all users holding it', async () => {
    const db = makeDb({
      rolesUsers: { find: async () => [{ get: () => 7 }, { get: () => 9 }] },
    });
    const expander = new AudienceExpander(db);
    const ids = await expander.expandUserIds([
      { workflowId: 1, type: APPROVAL_AUDIENCE_TYPE.ROLE, targetKey: 'role-x' },
    ]);
    expect(ids).toEqual([7, 9]);
  });

  it('expands a department to all its users', async () => {
    const db = makeDb({
      departmentsUsers: { find: async () => [{ get: () => 3 }, { get: () => 4 }, { get: () => 5 }] },
    });
    const expander = new AudienceExpander(db);
    const ids = await expander.expandUserIds([
      { workflowId: 1, type: APPROVAL_AUDIENCE_TYPE.DEPARTMENT, targetKey: '5' },
    ]);
    expect(ids).toEqual([3, 4, 5]);
  });

  it('de-duplicates across sources and returns sorted ids', async () => {
    const db = makeDb({
      rolesUsers: { find: async () => [{ get: () => 5 }] },
      departmentsUsers: { find: async () => [{ get: () => 5 }, { get: () => 2 }] },
    });
    const expander = new AudienceExpander(db);
    const ids = await expander.expandUserIds([
      { workflowId: 1, type: APPROVAL_AUDIENCE_TYPE.USER, targetKey: '5' },
      { workflowId: 1, type: APPROVAL_AUDIENCE_TYPE.ROLE, targetKey: 'r' },
      { workflowId: 1, type: APPROVAL_AUDIENCE_TYPE.DEPARTMENT, targetKey: 'd' },
    ]);
    expect(ids).toEqual([2, 5]);
  });

  it('returns [] for an empty audience config', async () => {
    const expander = new AudienceExpander(makeDb({}));
    expect(await expander.expandUserIds([])).toEqual([]);
  });

  it('ignores an unknown audience type', async () => {
    const expander = new AudienceExpander(makeDb({}));
    const ids = await expander.expandUserIds([{ workflowId: 1, type: 'bogus', targetKey: '1' }]);
    expect(ids).toEqual([]);
  });

  it('contributes nothing when a referenced role/department is gone', async () => {
    const db = makeDb({
      rolesUsers: { find: async () => [] },
    });
    const expander = new AudienceExpander(db);
    const ids = await expander.expandUserIds([{ workflowId: 1, type: APPROVAL_AUDIENCE_TYPE.ROLE, targetKey: 'gone' }]);
    expect(ids).toEqual([]);
  });
});
