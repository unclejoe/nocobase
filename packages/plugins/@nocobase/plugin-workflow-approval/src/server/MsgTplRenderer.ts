/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * MsgTplRenderer — template-driven notification rendering for approval events.
 *
 * Loads an `approvalMsgTpls` row by `type` ('todo' | 'done') and renders its
 * `template` json (Handlebars, matching plugin-notification-manager's compile
 * convention) against the provided variables. Falls back to sensible built-in
 * defaults when no template row is configured, so notification works out of the
 * box and degrades gracefully.
 *
 * Template json contract (per §2.6):
 *   { "title": "...", "content": "..." }
 * with Handlebars variables: {{approvalId}}, {{title}}, {{status}}, {{comment}},
 * {{applicantId}}.
 */

import type { Database } from '@nocobase/database';
import { Handlebars } from '@nocobase/utils';

import { APPROVAL_MSG_TPL_COLLECTION } from '../common/constants';

/** The variables made available to every approval notification template. */
export interface NotificationVars {
  approvalId: number | string | null;
  /** Approval / record title. */
  title?: string;
  /** Outcome label for done notifications ('approved' | 'rejected' | 'returned' | 'withdrawn'). */
  status?: string;
  /** Approver / applicant comment, if any. */
  comment?: string;
  /** The applicant user id. */
  applicantId?: number | string | null;
}

export interface RenderedMessage {
  title: string;
  content: string;
}

/** Built-in fallback templates used when no approvalMsgTpls row exists. */
const DEFAULTS: Record<string, RenderedMessage> = {
  todo: {
    title: 'Approval todo',
    content: 'You have a pending approval request ({{approvalId}}).',
  },
  done: {
    title: 'Approval done',
    content: 'Your approval request ({{approvalId}}) was {{status}}.',
  },
};

function renderString(template: string, vars: NotificationVars): string {
  try {
    return Handlebars.compile(template)(vars);
  } catch {
    return template;
  }
}

/**
 * Render the notification message for a given event type.
 *
 * @param db the application database (used to look up approvalMsgTpls)
 * @param msgType 'todo' | 'done'
 * @param vars variables to interpolate into the template
 */
export async function renderNotification(
  db: Database,
  msgType: string,
  vars: NotificationVars,
): Promise<RenderedMessage> {
  const fallback = DEFAULTS[msgType] ?? DEFAULTS.todo;
  try {
    const Repo = db.getRepository(APPROVAL_MSG_TPL_COLLECTION);
    const tpl = Repo ? await Repo.findOne({ filter: { type: msgType }, sort: ['-createdAt'] }) : null;
    const templateJson = tpl ? (tpl.get('template') as { title?: string; content?: string } | null) : null;
    const titleTemplate = templateJson?.title ?? tpl?.get('title') ?? fallback.title;
    const contentTemplate = templateJson?.content ?? fallback.content;
    return {
      title: renderString(titleTemplate, vars),
      content: renderString(contentTemplate, vars),
    };
  } catch {
    // If the template lookup fails (collection missing, DB error), degrade to
    // the built-in default so the approval flow is never blocked.
    return {
      title: renderString(fallback.title, vars),
      content: renderString(fallback.content, vars),
    };
  }
}
