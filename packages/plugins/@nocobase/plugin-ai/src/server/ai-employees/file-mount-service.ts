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

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type PluginAIServer from '../plugin';

/**
 * Environment variable that opts the server into the Layer 1 "file mount"
 * mode. When unset, FileMountService is never instantiated and Layer 1 behaves
 * exactly as it did without this feature (zero behavior change, backward
 * compatible). Setting it points the service at a directory of *.md files to
 * load as markdownKnowledge overrides.
 */
export const AI_KB_DIR_ENV = 'NOCOBASE_AI_KB_DIR';

/**
 * Default poll interval for the periodic mtime-based incremental sync.
 * Exposed as a named constant so tests can pass a smaller interval. The 5 min
 * default is deliberately conservative: file-mount content changes rarely and
 * the startup scan already covers cold starts.
 */
export const DEFAULT_FILE_MOUNT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Separator between the AI employee username and the free-form title in a
 * mounted filename: `<aiEmployeeUsername>__<any title>.md`. A double
 * underscore is used so it does not collide with the single underscores that
 * commonly appear in usernames or titles.
 */
export const FILENAME_SEPARATOR = '__';

/**
 * One per-directory entry kept in the mtime cache so the incremental sync can
 * skip files whose content has not changed since the last scan.
 */
interface CachedFile {
  /** Absolute (or dir-relative) filename, e.g. `nathan__sop.md`. */
  filename: string;
  /** Last-known modification time in milliseconds since the epoch. */
  mtimeMs: number;
}

/**
 * Result of parsing a single mounted filename. Parsing is intentionally pure
 * (no I/O) so it can be unit-tested directly.
 *
 * - `matchedUsername` is `null` when the filename does not contain the double
 *   underscore separator, or when the prefix is not in the provided valid
 *   username set. Callers treat `null` as "ignore this file" (with a log
 *   warning at the scan layer).
 */
export interface ParsedMountFilename {
  filename: string;
  matchedUsername: string | null;
  title: string | null;
}

/**
 * Parse a mounted markdown filename into its username / title components.
 *
 * Convention: `<aiEmployeeUsername>__<any title>.md`. Only the first double
 * underscore splits the name; the remainder (including any further `__`) is
 * treated as free-form title text. The `.md` extension is stripped from the
 * title. Files without the separator, or whose prefix is not a known AI
 * employee username, yield `matchedUsername: null` so the caller can skip and
 * warn without throwing.
 *
 * @param filename the bare filename (no directory), e.g. `nathan__sop.md`.
 * @param validUsernames the set of known AI employee usernames to match
 *   against. Matching is case-insensitive to be forgiving of cross-platform
 *   filename casing, but the returned username preserves the canonical casing
 *   from `validUsernames`.
 */
export function parseMountFilename(filename: string, validUsernames: Set<string>): ParsedMountFilename {
  const lowerMap = new Map<string, string>();
  for (const u of validUsernames) {
    lowerMap.set(u.toLowerCase(), u);
  }

  if (!filename.toLowerCase().endsWith('.md')) {
    return { filename, matchedUsername: null, title: null };
  }

  const base = filename.slice(0, -3); // strip `.md`
  const sepIndex = base.indexOf(FILENAME_SEPARATOR);
  if (sepIndex <= 0) {
    // No separator, or separator at the very start (empty username) -> ignore.
    return { filename, matchedUsername: null, title: null };
  }

  const prefix = base.slice(0, sepIndex);
  const canonical = lowerMap.get(prefix.toLowerCase());
  if (!canonical) {
    return { filename, matchedUsername: null, title: null };
  }

  const title = base.slice(sepIndex + FILENAME_SEPARATOR.length);
  return { filename, matchedUsername: canonical, title: title || null };
}

/**
 * Layer 1 "file mount" service.
 *
 * When `NOCOBASE_AI_KB_DIR` is set, this service scans that directory for
 * `*.md` files at startup and on a periodic timer, aggregates them by AI
 * employee username (using the filename prefix convention), and exposes the
 * aggregated markdown via {@link getMarkdownKnowledge}. The L1-1 injection
 * path in `ai-employee.ts` consults this cache and applies it as a
 * markdownKnowledge override (see the merge-strategy note below).
 *
 * MERGE STRATEGY (cache overrides DB field):
 * When the env var is set AND a file matches this employee, the file-mounted
 * content REPLACES the database `markdownKnowledge` field. Rationale: file
 * mount is an operator/deployment-level tool meant to enforce rules across
 * environments, so the on-disk source of truth should win. When the env var is
 * unset (service disabled) or no file matches this employee, the DB field
 * stays authoritative — i.e. zero behavior change versus the baseline. This
 * keeps {@link getMarkdownKnowledge} a pure, side-effect-free lookup that the
 * injection path can call without coupling to the file system.
 *
 * Error tolerance:
 * - Missing directory / no read permission at startup -> warn, do not throw;
 *   periodic sync keeps retrying so a later `mkdir` or `chmod` is picked up.
 * - A single file read/parse failure does not abort the rest of the scan; the
 *   failing file is skipped with a warning and the cache keeps prior values.
 */
export class FileMountService {
  private cache = new Map<string, string>();
  private mtimes = new Map<string, CachedFile>();
  /**
   * Last-read body of each scanned file, keyed by filename. Kept across sync
   * passes so the mtime fast-path can reuse an unchanged file's content
   * without re-reading it. Rebuilt atomically alongside `mtimes`/`cache`.
   */
  private bodies = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private knownUsernames = new Set<string>();

  constructor(
    private readonly plugin: PluginAIServer,
    private readonly dir: string,
    private readonly syncIntervalMs: number = DEFAULT_FILE_MOUNT_SYNC_INTERVAL_MS,
  ) {}

  /**
   * Whether the feature is enabled, i.e. the env var pointed at a directory.
   * The injection path uses this to short-circuit and preserve baseline
   * behavior entirely.
   */
  get enabled(): boolean {
    return this.dir !== '';
  }

  /**
   * Refresh the set of known AI employee usernames. Called at startup and on
   * each sync so that newly created employees pick up matching files without a
   * restart. Returns the set so callers/tests can inspect it.
   */
  async refreshKnownUsernames(): Promise<Set<string>> {
    const repo = this.plugin.db.getRepository('aiEmployees');
    const employees = await repo.find({ fields: ['username'] });
    const usernames = new Set<string>();
    for (const emp of employees) {
      const username = emp.get?.('username') ?? (emp as { username?: string }).username;
      if (typeof username === 'string' && username.length > 0) {
        usernames.add(username);
      }
    }
    this.knownUsernames = usernames;
    return usernames;
  }

  /**
   * Boot the service: refresh the username roster, run an initial full scan,
   * and arm the periodic incremental-sync timer. Safe to call even when the
   * directory does not yet exist (it warns and keeps the timer running so a
   * later-created dir is picked up). Errors from the initial scan are logged
   * and swallowed so a bad mount never prevents the app from starting.
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      await this.refreshKnownUsernames();
    } catch (e) {
      this.plugin.app.log.warn('[FileMountService] failed to load AI employee usernames', { error: e });
    }
    try {
      await this.sync();
    } catch (e) {
      this.plugin.app.log.warn('[FileMountService] initial scan failed; periodic sync will retry', {
        dir: this.dir,
        error: e,
      });
    }
    if (this.syncIntervalMs > 0) {
      this.timer = setInterval(() => {
        this.sync().catch((e) => {
          this.plugin.app.log.warn('[FileMountService] periodic sync failed', { dir: this.dir, error: e });
        });
      }, this.syncIntervalMs);
      // Don't keep the Node.js event loop alive solely for this interval — the
      // app has its own keep-alive mechanisms, and an unref'd timer is one less
      // thing to clean up on shutdown.
      this.timer.unref?.();
    }
  }

  /**
   * Stop the periodic sync timer. Must be called on plugin shutdown to avoid
   * leaking the interval. Idempotent.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Read-only snapshot of the file-mounted markdown for an employee. Returns
   * `undefined` when nothing is mounted for `username`, which lets the
   * injection path fall back to the DB field unchanged.
   */
  getMarkdownKnowledge(username: string): string | undefined {
    if (!this.enabled) {
      return undefined;
    }
    return this.cache.get(username);
  }

  /**
   * Perform one (incremental) sync pass. Reads the directory, and for each
   * `*.md` file whose mtime changed since the last scan, re-reads and
   * re-aggregates it into the cache. Uses mtime so the common steady state
   * (no edits) does zero file reads. Errors per file are isolated.
   *
   * Visibility is `public` (rather than `private`) purely so tests can drive a
   * single pass deterministically without depending on real timers.
   */
  async sync(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const dirStat = await stat(this.dir).catch((e) => {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        this.plugin.app.log.warn('[FileMountService] knowledge directory does not exist; skipping scan', {
          dir: this.dir,
        });
      } else if (code === 'EACCES') {
        this.plugin.app.log.warn('[FileMountService] no read permission for knowledge directory; skipping scan', {
          dir: this.dir,
        });
      } else {
        this.plugin.app.log.warn('[FileMountService] cannot stat knowledge directory; skipping scan', {
          dir: this.dir,
          error: e,
        });
      }
      throw e;
    });
    if (!dirStat.isDirectory()) {
      this.plugin.app.log.warn('[FileMountService] configured path is not a directory; skipping scan', {
        dir: this.dir,
      });
      return;
    }

    const entries = await readdir(this.dir).catch((e) => {
      this.plugin.app.log.warn('[FileMountService] cannot read knowledge directory; skipping scan', {
        dir: this.dir,
        error: e,
      });
      throw e;
    });

    // Aggregate per-employee content in a fresh map, then swap atomically so a
    // mid-scan query never sees a half-built cache. We rebuild fully rather
    // than patch, because a deleted file must drop the employee's override and
    // multiple files per employee concatenate deterministically (sorted).
    const next = new Map<string, string>();
    const nextMtimes = new Map<string, CachedFile>();
    const mdFiles = entries.filter((name) => name.toLowerCase().endsWith('.md')).sort();

    // Cache the body of each *unchanged* file so the mtime fast-path can reuse
    // it without re-reading from disk. We keep this as a local map (rather than
    // on the instance) because the aggregation rebuilds `next` from scratch and
    // we only need bodies for files that survived this pass.
    const prevBodies = this.bodies;
    const nextBodies = new Map<string, string>();

    for (const filename of mdFiles) {
      try {
        const fullPath = join(this.dir, filename);
        const st = await stat(fullPath);
        const mtimeMs = st.mtimeMs;
        const prev = this.mtimes.get(filename);

        // mtime fast-path: if the file hasn't changed since the last successful
        // scan AND we still have its cached body, reuse it and skip the disk
        // read entirely. This makes the common steady-state pass (no edits)
        // cost only stat()s, no file reads.
        let content: string;
        if (prev && prev.mtimeMs === mtimeMs && prevBodies.has(filename)) {
          content = prevBodies.get(filename) as string;
        } else {
          content = await readFile(fullPath, 'utf8');
        }
        nextMtimes.set(filename, { filename, mtimeMs });
        nextBodies.set(filename, content);

        const parsed = parseMountFilename(filename, this.knownUsernames);
        if (!parsed.matchedUsername) {
          this.plugin.app.log.warn(
            '[FileMountService] ignoring .md file: filename prefix did not match any AI employee',
            {
              dir: this.dir,
              filename,
              hint: `expected <username>${FILENAME_SEPARATOR}<title>.md`,
            },
          );
          continue;
        }
        const existing = next.get(parsed.matchedUsername);
        next.set(parsed.matchedUsername, existing ? `${existing}\n\n${content}` : content);
      } catch (e) {
        this.plugin.app.log.warn('[FileMountService] failed to process a knowledge file; skipping it', {
          dir: this.dir,
          filename,
          error: e,
        });
      }
    }

    this.cache = next;
    this.mtimes = nextMtimes;
    this.bodies = nextBodies;
  }

  /**
   * Test/maintenance helper exposing the cache size (number of employees with
   * a mounted override). Not used by production code paths.
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Build a FileMountService from the environment. Returns `null` when the env
 * var is unset so callers can keep a nullable reference and skip all
 * integration when the feature is off (the baseline path).
 */
export function createFileMountService(plugin: PluginAIServer): FileMountService | null {
  const dir = process.env[AI_KB_DIR_ENV];
  if (!dir || dir.trim() === '') {
    return null;
  }
  return new FileMountService(plugin, dir.trim());
}
