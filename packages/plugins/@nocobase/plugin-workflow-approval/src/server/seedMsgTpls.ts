/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Seed default approvalMsgTpls rows (§2.6) on first install.
 *
 * Two templates are seeded — `todo` (pending notification to approvers) and
 * `done` (result notification to the applicant) — using the in-app-message
 * channel. Both use Handlebars variables resolved by MsgTplRenderer:
 * {{approvalId}}, {{title}}, {{status}}, {{applicantId}}.
 *
 * Idempotent: only inserts a type when no row for it exists, so production data
 * and user edits are never clobbered.
 */

import type { Repository } from '@nocobase/database';
import { APPROVAL_MSG_TYPE } from '../common/constants';

interface SeedTpl {
  type: string;
  notificationType: string;
  title: string;
  template: { title: string; content: string };
}

const SEED_TEMPLATES: SeedTpl[] = [
  {
    type: APPROVAL_MSG_TYPE.TODO,
    notificationType: 'in-app-message',
    title: 'Approval todo',
    template: {
      title: 'Approval todo',
      content: 'You have a pending approval request ({{approvalId}}).',
    },
  },
  {
    type: APPROVAL_MSG_TYPE.DONE,
    notificationType: 'in-app-message',
    title: 'Approval done',
    template: {
      title: 'Approval done',
      content: 'Your approval request ({{approvalId}}) was {{status}}.',
    },
  },
];

export async function seedDefaultMsgTpls(Repo: Repository): Promise<void> {
  for (const tpl of SEED_TEMPLATES) {
    const existing = await Repo.findOne({ filter: { type: tpl.type } });
    if (existing) {
      // Never overwrite an existing (possibly production / user-edited) row.
      continue;
    }
    await Repo.create({
      values: {
        type: tpl.type,
        notificationType: tpl.notificationType,
        title: tpl.title,
        template: tpl.template,
      },
    });
  }
}
