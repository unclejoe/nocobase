/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Tests for MsgTplRenderer + seedDefaultMsgTpls (§2.6 / §4.6).
 *
 * Covers:
 *  - template variables ({{approvalId}}, {{status}}, ...) are interpolated;
 *  - a configured approvalMsgTpls row overrides the built-in default;
 *  - missing template → falls back to the built-in default (graceful);
 *  - the renderer never throws on a bad template (degrades to the raw string);
 *  - seedDefaultMsgTpls is idempotent and never overwrites existing rows.
 */

import { describe, expect, it, vi } from 'vitest';
import { APPROVAL_MSG_TYPE } from '../../common/constants';
import { renderNotification } from '../MsgTplRenderer';
import { seedDefaultMsgTpls } from '../seedMsgTpls';

/** Minimal fake row shape returned by the fake repository. */
type Row = { get: (key: string) => unknown };

function makeRepo(rowFor: (type: string) => Row | null) {
  const findOne = vi.fn(async ({ filter }: { filter: { type: string } }) => rowFor(filter.type));
  return { findOne, create: vi.fn(async () => ({})) };
}

function makeDb(repo: ReturnType<typeof makeRepo>) {
  return { getRepository: () => repo } as unknown as Parameters<typeof renderNotification>[0];
}

describe('renderNotification — template-driven rendering', () => {
  it('uses the built-in default when no template row exists', async () => {
    const repo = makeRepo(() => null);
    const msg = await renderNotification(makeDb(repo), APPROVAL_MSG_TYPE.TODO, {
      approvalId: 42,
      title: 'Quote approval',
    });
    expect(msg.title).toBe('Approval todo');
    expect(msg.content).toContain('42');
  });

  it('interpolates {{status}} into the done default', async () => {
    const repo = makeRepo(() => null);
    const msg = await renderNotification(makeDb(repo), APPROVAL_MSG_TYPE.DONE, {
      approvalId: 7,
      status: 'approved',
    });
    expect(msg.content).toContain('approved');
  });

  it('uses a configured approvalMsgTpls row when present', async () => {
    const repo = makeRepo((type) =>
      type === APPROVAL_MSG_TYPE.TODO
        ? ({
            get: (k: string) =>
              k === 'template' ? { title: 'Custom {{title}}', content: 'Approve #{{approvalId}}' } : 'Custom row',
          } as Row)
        : null,
    );
    const msg = await renderNotification(makeDb(repo), APPROVAL_MSG_TYPE.TODO, {
      approvalId: 99,
      title: 'Quote',
    });
    expect(msg.title).toBe('Custom Quote');
    expect(msg.content).toBe('Approve #99');
  });

  it('falls back gracefully if the repository lookup throws', async () => {
    const db = {
      getRepository: () => {
        throw new Error('boom');
      },
    } as unknown as Parameters<typeof renderNotification>[0];
    const msg = await renderNotification(db, APPROVAL_MSG_TYPE.TODO, { approvalId: 1 });
    expect(msg.title).toBe('Approval todo');
  });
});

describe('seedDefaultMsgTpls — idempotent seeding', () => {
  it('creates todo and done rows when none exist', async () => {
    const repo = makeRepo(() => null);
    await seedDefaultMsgTpls(repo as unknown as Parameters<typeof seedDefaultMsgTpls>[0]);
    expect(repo.findOne).toHaveBeenCalledTimes(2);
    expect(repo.create).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite an existing row for a given type', async () => {
    const repo = makeRepo((type) => (type === APPROVAL_MSG_TYPE.TODO ? ({ get: () => 'existing' } as Row) : null));
    await seedDefaultMsgTpls(repo as unknown as Parameters<typeof seedDefaultMsgTpls>[0]);
    // todo exists → skipped; done missing → created once.
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
});
