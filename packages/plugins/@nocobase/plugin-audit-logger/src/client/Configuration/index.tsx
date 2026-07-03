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

import { ExtendCollectionsProvider, NocoBaseRecursionField, SchemaComponentOptions } from '@nocobase/client';
import { AIEmployeeShortcut } from '@nocobase/plugin-ai/client-v2';
import { useAIConfigRepository, useChatBoxActions } from '@nocobase/plugin-ai/client';

// Local Task shape matching the v1 plugin-ai Task that useChatBoxActions'
// triggerTask expects (its `message` is required). The v2 Task makes `message`
// optional, which the v1 triggerTask signature rejects. See AuditLogsPage.tsx
// for the same workaround.
interface Task {
  title?: string;
  message: { system?: string; user?: string };
  autoSend?: boolean;
}
import { useRequest } from 'ahooks';
import { Flex, Tabs } from 'antd';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import auditTrailsCollection from '../../collections/auditTrails';
import { NAMESPACE } from '../../constants';
import { AuditConfigPanel } from './AuditConfigPanel';
import { components, auditLogsSchema } from './schema';

export const AuditLogsConfiguration = () => {
  const { t } = useTranslation([NAMESPACE, 'client'], { nsMode: 'fallback' });

  // Auditor AI employee + chat trigger. `AIEmployeeShortcut` is a presentational
  // component (it does not open the chat itself); we drive the global chat box
  // via `useChatBoxActions().triggerTask`, the same hook the flow-model avatar
  // uses. Clicking the avatar opens the chat with a greeting; clicking a task
  // in the profile card sends that single task automatically. `useRequest`
  // populates the repository's cache and re-renders once the auditor is loaded.
  const aiConfigRepository = useAIConfigRepository();
  const { triggerTask } = useChatBoxActions();
  const { data: employees } = useRequest(() => aiConfigRepository.getAIEmployees());
  const auditor = useMemo(() => employees?.find((item) => item.username === 'auditor'), [employees]);
  const openAuditorChat = () => {
    if (!auditor) {
      return;
    }
    triggerTask({ aiEmployee: auditor });
  };
  const triggerAuditorTask = (task: Task) => {
    if (!auditor) {
      return;
    }
    triggerTask({ aiEmployee: auditor, tasks: [task], auto: true });
  };

  // Preset audit-analysis tasks for the Auditor AI employee. Each auto-sends a
  // prompt; the employee loads the `audit-analysis` skill (which queries
  // auditTrails:list itself), so the page does not pre-fetch data.
  const tasks = useMemo<Task[]>(
    () => [
      {
        title: t('Analyze recent failed sign-ins'),
        message: {
          system: 'Load the audit-analysis skill, then analyze failed sign-ins.',
          user: t(
            'Find accounts with repeated failed sign-ins (status >= 400) and any successful sign-in that immediately followed.',
          ),
        },
        autoSend: true,
      },
      {
        title: t('Check sensitive resource changes'),
        message: {
          system: 'Load the audit-analysis skill, then review sensitive changes.',
          user: t('Review updates and deletions on roles and users, and any bulk destroy actions.'),
        },
        autoSend: true,
      },
      {
        title: t('Summarize anomalous IPs'),
        message: {
          system: 'Load the audit-analysis skill, then summarize anomalous IPs.',
          user: t('Group activity by IP and highlight unfamiliar IPs or IPs with many denied actions.'),
        },
        autoSend: true,
      },
    ],
    [t],
  );

  return (
    <ExtendCollectionsProvider collections={[auditTrailsCollection]}>
      <SchemaComponentOptions components={components}>
        <Tabs
          items={[
            {
              key: 'config',
              label: t('Audit config'),
              children: <AuditConfigPanel />,
            },
            {
              key: 'logs',
              label: t('Logs'),
              children: (
                <>
                  <Flex justify="flex-end" style={{ marginBottom: 'var(--nb-spacing)' }}>
                    <AIEmployeeShortcut
                      aiEmployee={{ username: 'auditor' }}
                      tasks={tasks}
                      size={32}
                      mask={false}
                      onClick={openAuditorChat}
                      onTaskClick={triggerAuditorTask}
                    />
                  </Flex>
                  <NocoBaseRecursionField schema={auditLogsSchema} />
                </>
              ),
            },
          ]}
        />
      </SchemaComponentOptions>
    </ExtendCollectionsProvider>
  );
};
