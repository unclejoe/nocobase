/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Unit tests for ApproverResolver.
 *
 * The resolver is thin DB-lookup logic, so we mock the repositories it uses
 * (rolesUsers, departmentsUsers, users) and assert the resolution rules per
 * approver source, plus applicant self-exclusion and de-duplication.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApproverResolver } from '../ApproverResolver';
import { APPROVER_SOURCE } from '../../common/constants';

/** Build a fake Database with stub repositories returning canned rows. */
function makeDb(repos: Record<string, { find: (q: any) => Promise<any[]>; findOne?: (q: any) => Promise<any> }>) {
  return {
    getRepository(name: string) {
      return repos[name] ?? null;
    },
  } as any;
}

describe('ApproverResolver', () => {
  let resolver: ApproverResolver;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('resolves a directly-specified user', async () => {
    const db = makeDb({});
    resolver = new ApproverResolver(db);
    const ids = await resolver.resolve([{ source: APPROVER_SOURCE.USER, targetId: 42 }], 1);
    expect(ids).toEqual([42]);
  });

  it('resolves users by role via rolesUsers', async () => {
    const db = makeDb({
      rolesUsers: { find: async () => [{ get: () => 7 }, { get: () => 8 }] },
    });
    resolver = new ApproverResolver(db);
    const ids = await resolver.resolve([{ source: APPROVER_SOURCE.ROLE, targetId: 'role-x' }], null);
    expect(ids.sort()).toEqual([7, 8]);
  });

  it('resolves users by department, respecting onlyMain', async () => {
    const find = vi.fn(async (q: any) => {
      // Simulate onlyMain filtering at the repo level.
      const rows = [{ get: () => 11 }, { get: () => 12 }, { get: () => 13 }];
      return q.filter?.isMain ? rows.slice(0, 1) : rows;
    });
    const db = makeDb({ departmentsUsers: { find } });
    resolver = new ApproverResolver(db);
    const all = await resolver.resolve([{ source: APPROVER_SOURCE.DEPARTMENT, targetId: 5 }], null);
    expect(all.sort()).toEqual([11, 12, 13]);
    const mainOnly = await resolver.resolve(
      [{ source: APPROVER_SOURCE.DEPARTMENT, targetId: 5, onlyMain: true }],
      null,
    );
    expect(mainOnly).toEqual([11]);
  });

  it('resolves the supervisor as the owner of the applicant main department', async () => {
    const db = makeDb({
      users: { findOne: async () => ({ get: (k: string) => (k === 'mainDepartmentId' ? 9 : null) }) },
      departmentsUsers: { find: async () => [{ get: () => 99 }] },
    });
    resolver = new ApproverResolver(db);
    const ids = await resolver.resolve([{ source: APPROVER_SOURCE.SUPERVISOR }], 1);
    expect(ids).toEqual([99]);
  });

  it('excludes the applicant from their own approver set', async () => {
    const db = makeDb({});
    resolver = new ApproverResolver(db);
    const ids = await resolver.resolve(
      [
        { source: APPROVER_SOURCE.USER, targetId: 1 },
        { source: APPROVER_SOURCE.USER, targetId: 2 },
      ],
      1, // applicant is user 1
    );
    expect(ids).toEqual([2]);
  });

  it('de-duplicates across sources', async () => {
    const db = makeDb({
      rolesUsers: { find: async () => [{ get: () => 5 }] },
    });
    resolver = new ApproverResolver(db);
    const ids = await resolver.resolve(
      [
        { source: APPROVER_SOURCE.USER, targetId: 5 },
        { source: APPROVER_SOURCE.ROLE, targetId: 'r' },
      ],
      null,
    );
    expect(ids).toEqual([5]);
  });

  it('returns [] for an empty config and for an unknown source', async () => {
    const db = makeDb({});
    resolver = new ApproverResolver(db);
    expect(await resolver.resolve([], null)).toEqual([]);
    expect(await resolver.resolve([{ source: 'bogus' } as any], null)).toEqual([]);
  });

  it('returns [] when the supervisor lookup has no main department / no owner', async () => {
    const db = makeDb({
      users: { findOne: async () => ({ get: () => null }) },
      departmentsUsers: { find: async () => [] },
    });
    resolver = new ApproverResolver(db);
    const ids = await resolver.resolve([{ source: APPROVER_SOURCE.SUPERVISOR }], 1);
    expect(ids).toEqual([]);
  });
});
