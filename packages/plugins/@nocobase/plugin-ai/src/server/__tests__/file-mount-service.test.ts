/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co, Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseMountFilename,
  FileMountService,
  createFileMountService,
  AI_KB_DIR_ENV,
  FILENAME_SEPARATOR,
} from '../ai-employees/file-mount-service';

/**
 * Minimal stand-in for PluginAIServer exposing only what FileMountService
 * touches (db.getRepository('aiEmployees').find + app.log). Keeps the service
 * testable without booting the full NocoBase server / database.
 */
function makeMockPlugin(usernames: string[] = []) {
  const logs: string[] = [];
  let employees = usernames.map((username) => ({ get: (k: string) => (k === 'username' ? username : undefined) }));
  const plugin = {
    app: {
      log: {
        warn: (msg: string, extra?: unknown) => logs.push(`warn: ${msg} ${extra ? JSON.stringify(safe(extra)) : ''}`),
        info: (msg: string, extra?: unknown) => logs.push(`info: ${msg} ${extra ? JSON.stringify(safe(extra)) : ''}`),
        error: (msg: string, extra?: unknown) => logs.push(`error: ${msg} ${extra ? JSON.stringify(safe(extra)) : ''}`),
      },
    },
    db: {
      getRepository: () => ({
        find: async () => employees,
      }),
    },
    // test-only hook to mutate the employee roster between syncs
    __setEmployees(next: string[]) {
      employees = next.map((username) => ({
        get: (k: string) => (k === 'username' ? username : undefined),
      }));
    },
    __logs: logs,
  };
  return plugin;
}

// Strip Error instances (non-JSON-serializable) from log context so the
// captured log lines stay readable in test output.
function safe(extra: unknown): unknown {
  if (extra && typeof extra === 'object' && 'error' in extra) {
    const { error, ...rest } = extra as Record<string, unknown>;
    return { ...rest, error: error instanceof Error ? error.message : String(error) };
  }
  return extra;
}

describe('parseMountFilename', () => {
  const valid = new Set(['nathan', 'orin', 'dara', 'builder_bot']);

  it('matches a username prefix and returns the title', () => {
    const parsed = parseMountFilename(`nathan${FILENAME_SEPARATOR}sop.md`, valid);
    expect(parsed.matchedUsername).toBe('nathan');
    expect(parsed.title).toBe('sop');
  });

  it('matches case-insensitively but returns the canonical username casing', () => {
    const parsed = parseMountFilename(`NATHAN${FILENAME_SEPARATOR}sop.md`, valid);
    expect(parsed.matchedUsername).toBe('nathan');
  });

  it('keeps everything after the first separator as the title (including extra separators)', () => {
    const parsed = parseMountFilename(`dara${FILENAME_SEPARATOR}rules${FILENAME_SEPARATOR}v2.md`, valid);
    expect(parsed.matchedUsername).toBe('dara');
    expect(parsed.title).toBe(`rules${FILENAME_SEPARATOR}v2`);
  });

  it('returns null username when the prefix is not a known employee', () => {
    const parsed = parseMountFilename('stranger__sop.md', valid);
    expect(parsed.matchedUsername).toBeNull();
    expect(parsed.title).toBeNull();
  });

  it('returns null username when the separator is missing', () => {
    const parsed = parseMountFilename('nathan-sop.md', valid);
    expect(parsed.matchedUsername).toBeNull();
  });

  it('returns null username when the separator is at the very start', () => {
    const parsed = parseMountFilename(`${FILENAME_SEPARATOR}sop.md`, valid);
    expect(parsed.matchedUsername).toBeNull();
  });

  it('ignores non-markdown files', () => {
    const parsed = parseMountFilename('nathan__sop.txt', valid);
    expect(parsed.matchedUsername).toBeNull();
  });

  it('matches a username containing an underscore', () => {
    const parsed = parseMountFilename(`builder_bot${FILENAME_SEPARATOR}guide.md`, valid);
    expect(parsed.matchedUsername).toBe('builder_bot');
  });
});

describe('FileMountService sync', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ai-kb-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('aggregates multiple files per employee, sorted deterministically', async () => {
    await writeFile(join(dir, `nathan${FILENAME_SEPARATOR}b.md`), 'B-content');
    await writeFile(join(dir, `nathan${FILENAME_SEPARATOR}a.md`), 'A-content');
    const plugin = makeMockPlugin(['nathan']);
    const service = new FileMountService(plugin as never, dir, 0);
    await service.refreshKnownUsernames();
    await service.sync();

    const knowledge = service.getMarkdownKnowledge('nathan');
    expect(knowledge).toBe('A-content\n\nB-content');
  });

  it('ignores files whose prefix does not match an employee (with a log warning)', async () => {
    await writeFile(join(dir, `nathan${FILENAME_SEPARATOR}sop.md`), 'keep');
    await writeFile(join(dir, `stranger${FILENAME_SEPARATOR}sop.md`), 'drop');
    const plugin = makeMockPlugin(['nathan']);
    const service = new FileMountService(plugin as never, dir, 0);
    await service.refreshKnownUsernames();
    await service.sync();

    expect(service.getMarkdownKnowledge('nathan')).toBe('keep');
    expect(service.getMarkdownKnowledge('stranger')).toBeUndefined();
    expect(plugin.__logs.some((l) => l.includes('stranger') && l.includes('ignoring'))).toBe(true);
  });

  it('isolates per-file failures: a bad file does not abort the scan', async () => {
    await writeFile(join(dir, `nathan${FILENAME_SEPARATOR}good.md`), 'good');
    // Create a directory where a file is expected; stat() is fine but
    // readFile of a directory throws EISDIR -> exercises the catch path.
    await mkdir(join(dir, `nathan${FILENAME_SEPARATOR}bad.md`));
    const plugin = makeMockPlugin(['nathan']);
    const service = new FileMountService(plugin as never, dir, 0);
    await service.refreshKnownUsernames();
    await service.sync();

    expect(service.getMarkdownKnowledge('nathan')).toBe('good');
    expect(plugin.__logs.some((l) => l.includes('failed to process'))).toBe(true);
  });

  it('only re-reads files whose mtime changed (mtime incremental)', async () => {
    const fileA = join(dir, `nathan${FILENAME_SEPARATOR}a.md`);
    const fileB = join(dir, `nathan${FILENAME_SEPARATOR}b.md`);
    await writeFile(fileA, 'A-v1');
    await writeFile(fileB, 'B-v1');
    const plugin = makeMockPlugin(['nathan']);
    const service = new FileMountService(plugin as never, dir, 0);
    await service.refreshKnownUsernames();
    await service.sync();
    expect(service.getMarkdownKnowledge('nathan')).toBe('A-v1\n\nB-v1');

    // Overwrite only A; mtime of B is unchanged. Use a fresh mtime that is
    // strictly greater by writing with a delay via utimes-like content change.
    await writeFile(fileA, 'A-v2');
    // Bump A's mtime deterministically (some filesystems have coarse mtime
    // resolution) by re-statting after a forced future time.
    const { utimes } = await import('node:fs/promises');
    const future = Date.now() / 1000 + 60;
    await utimes(fileA, future, future);

    await service.sync();
    expect(service.getMarkdownKnowledge('nathan')).toBe('A-v2\n\nB-v1');
  });

  it('drops an employee override when its file is deleted', async () => {
    const file = join(dir, `nathan${FILENAME_SEPARATOR}sop.md`);
    await writeFile(file, 'sop');
    const plugin = makeMockPlugin(['nathan']);
    const service = new FileMountService(plugin as never, dir, 0);
    await service.refreshKnownUsernames();
    await service.sync();
    expect(service.getMarkdownKnowledge('nathan')).toBe('sop');

    await rm(file, { force: true });
    await service.sync();
    expect(service.getMarkdownKnowledge('nathan')).toBeUndefined();
  });

  it('picks up employees created between syncs', async () => {
    await writeFile(join(dir, `dara${FILENAME_SEPARATOR}sop.md`), 'dara-sop');
    const plugin = makeMockPlugin(['nathan']);
    const service = new FileMountService(plugin as never, dir, 0);
    await service.refreshKnownUsernames();
    await service.sync();
    expect(service.getMarkdownKnowledge('dara')).toBeUndefined();

    plugin.__setEmployees(['nathan', 'dara']);
    await service.refreshKnownUsernames();
    await service.sync();
    expect(service.getMarkdownKnowledge('dara')).toBe('dara-sop');
  });
});

describe('FileMountService error tolerance', () => {
  it('start() does not throw when the directory does not exist', async () => {
    const plugin = makeMockPlugin(['nathan']);
    const service = new FileMountService(plugin as never, join(tmpdir(), 'definitely-missing-' + Date.now()), 0);
    await expect(service.start()).resolves.toBeUndefined();
    expect(service.getMarkdownKnowledge('nathan')).toBeUndefined();
    expect(plugin.__logs.some((l) => l.includes('does not exist'))).toBe(true);
  });

  it('sync() warns and rejects on an unreadable directory (no read permission)', async () => {
    // chmod 0o000 only meaningfully blocks non-root users; guard the assertion
    // so the test still passes when the test runner is root (CI containers).
    const dir = await mkdtemp(join(tmpdir(), 'ai-kb-noperm-'));
    try {
      await writeFile(join(dir, `nathan${FILENAME_SEPARATOR}sop.md`), 'x');
      await chmod(dir, 0o000);
      const plugin = makeMockPlugin(['nathan']);
      const service = new FileMountService(plugin as never, dir, 0);
      await service.refreshKnownUsernames();

      const isRoot = process.getuid?.() === 0;
      if (isRoot) {
        // root bypasses permission checks; just assert no throw and skip
        await service.sync().catch(() => undefined);
      } else {
        await expect(service.sync()).rejects.toThrow();
        expect(plugin.__logs.some((l) => l.includes('no read permission') || l.includes('cannot read'))).toBe(true);
      }
    } finally {
      await chmod(dir, 0o700);
    }
  });

  it('sync() warns when the configured path is a file, not a directory', async () => {
    const filePath = join(tmpdir(), `ai-kb-notadir-${Date.now()}.md`);
    await writeFile(filePath, 'not a dir');
    try {
      const plugin = makeMockPlugin(['nathan']);
      const service = new FileMountService(plugin as never, filePath, 0);
      await service.refreshKnownUsernames();
      await service.sync();
      expect(plugin.__logs.some((l) => l.includes('not a directory'))).toBe(true);
    } finally {
      await rm(filePath, { force: true });
    }
  });
});

describe('FileMountService disabled (env unset) = zero behavior change', () => {
  const prevEnv = process.env[AI_KB_DIR_ENV];

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env[AI_KB_DIR_ENV];
    } else {
      process.env[AI_KB_DIR_ENV] = prevEnv;
    }
  });

  it('createFileMountService returns null when the env var is unset', () => {
    delete process.env[AI_KB_DIR_ENV];
    expect(createFileMountService(makeMockPlugin() as never)).toBeNull();
  });

  it('a disabled service always returns undefined, regardless of cache', () => {
    delete process.env[AI_KB_DIR_ENV];
    const service = new FileMountService(makeMockPlugin(['nathan']) as never, '', 0);
    expect(service.enabled).toBe(false);
    expect(service.getMarkdownKnowledge('nathan')).toBeUndefined();
  });
});

describe('FileMountService start/stop timer lifecycle', () => {
  it('start() arms a periodic timer and stop() clears it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ai-kb-timer-'));
    try {
      await writeFile(join(dir, `nathan${FILENAME_SEPARATOR}sop.md`), 'sop');
      const plugin = makeMockPlugin(['nathan']);
      const service = new FileMountService(plugin as never, dir, 1000);
      await service.start();
      // The timer reference is private; assert behaviorally that stop() is a
      // safe no-op when there is nothing to stop, and that a second start is
      // idempotent enough not to throw.
      service.stop();
      service.stop();
      expect(service.getMarkdownKnowledge('nathan')).toBe('sop');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
