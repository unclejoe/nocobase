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

import { ReloadOutlined } from '@ant-design/icons';
import { AIEmployeeShortcut } from '@nocobase/plugin-ai/client-v2';
import { useAIConfigRepository, useChatBoxActions } from '@nocobase/plugin-ai/client';

// Local Task shape matching the v1 plugin-ai Task that useChatBoxActions'
// triggerTask expects (its `message` is required). The v2 Task makes `message`
// optional, which the v1 triggerTask signature rejects; importing the v1 Task
// type via a deep path is unreliable across the package's dist layout, so we
// re-declare the minimal shape here.
interface Task {
  title?: string;
  message: { system?: string; user?: string };
  autoSend?: boolean;
}
import {
  CollectionFilter,
  DEFAULT_PAGE_SIZE,
  DrawerFormLayout,
  ExtendCollectionsProvider,
  Table,
} from '@nocobase/client-v2';
import { useFlowContext, useFlowEngine } from '@nocobase/flow-engine';
import { useMemoizedFn, useRequest } from 'ahooks';
import { Button, Card, Flex, Form, Input, Space, Tag, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import React, { useMemo, useState } from 'react';
import auditTrailsCollection from '../../collections/auditTrails';
import { COLLECTION_NAME } from '../../constants';
import { useT } from '../locale';

type AuditRecord = {
  id: number | string;
  uuid?: string;
  dataSource?: string;
  resource?: string;
  action?: string;
  requestSource?: string;
  userId?: string;
  roleName?: string;
  ip?: string;
  ua?: string;
  status?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

// Fields that carry no filtering value in the UI.
const NON_FILTERABLE_FIELD_NAMES = ['uuid', 'ua', 'metadata'];

const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';

function formatJson(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDate(value?: string): string {
  if (!value) return '';
  const d = dayjs(value);
  return d.isValid() ? d.format(DATE_FORMAT) : value;
}

function normalizeListResponse(response: unknown) {
  const body = (
    response as {
      data?: { data?: AuditRecord[] | { data?: AuditRecord[] }; meta?: { count?: number; total?: number } };
    }
  )?.data;
  const payload = body?.data;
  const records: AuditRecord[] = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const meta = body?.meta || {};
  return {
    records,
    total: meta.count || meta.total || records.length,
  };
}

function AuditLogDetailDrawer({ record }: { record: AuditRecord }) {
  const t = useT();
  return (
    <DrawerFormLayout title={t('Log detail')} footer={<></>}>
      <Form layout="vertical">
        <Form.Item label={t('UUID')}>
          <Input value={record.uuid ?? ''} disabled />
        </Form.Item>
        <Form.Item label={t('Resource')}>
          <Typography.Text>{record.resource}</Typography.Text>
        </Form.Item>
        <Form.Item label={t('Action')}>
          <Typography.Text>{record.action}</Typography.Text>
        </Form.Item>
        <Form.Item label={t('User ID')}>
          <Typography.Text>{record.userId}</Typography.Text>
        </Form.Item>
        <Form.Item label={t('Role')}>
          <Typography.Text>{record.roleName}</Typography.Text>
        </Form.Item>
        <Form.Item label={t('Status')}>
          <Tag color={record.status && record.status < 400 ? 'green' : 'red'}>{record.status}</Tag>
        </Form.Item>
        <Form.Item label={t('IP')}>
          <Typography.Text>{record.ip}</Typography.Text>
        </Form.Item>
        <Form.Item label={t('User agent')}>
          <Typography.Text>{record.ua}</Typography.Text>
        </Form.Item>
        <Form.Item label={t('Metadata')}>
          <Typography.Text>
            <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {formatJson(record.metadata)}
            </pre>
          </Typography.Text>
        </Form.Item>
        <Form.Item label={t('Created at')}>
          <Typography.Text>{formatDate(record.createdAt)}</Typography.Text>
        </Form.Item>
      </Form>
    </DrawerFormLayout>
  );
}

function AuditLogsPageInner() {
  const t = useT();
  const ctx = useFlowContext();
  const engine = useFlowEngine();
  const { token } = theme.useToken();
  const resource = useMemo(() => ctx.api.resource(COLLECTION_NAME), [ctx.api]);
  const filterCollection = useMemo(
    () => engine.context.dataSourceManager?.getDataSource?.('main')?.getCollection?.(COLLECTION_NAME),
    [engine],
  );

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
  const openAuditorChat = useMemoizedFn(() => {
    if (!auditor) {
      return;
    }
    triggerTask({ aiEmployee: auditor });
  });
  const triggerAuditorTask = useMemoizedFn((task: Task) => {
    if (!auditor) {
      return;
    }
    triggerTask({ aiEmployee: auditor, tasks: [task], auto: true });
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filterPayload, setFilterPayload] = useState<unknown>(undefined);

  const { data, loading, refresh } = useRequest(
    async () => {
      const response = await resource.list({
        page,
        pageSize,
        sort: ['-createdAt'],
        ...(filterPayload ? { filter: filterPayload } : {}),
      });
      return normalizeListResponse(response);
    },
    {
      refreshDeps: [page, pageSize, filterPayload],
    },
  );

  const handlePaginationChange = useMemoizedFn((nextPage: number, nextPageSize: number) => {
    if (nextPageSize !== pageSize) {
      setPageSize(nextPageSize);
      setPage(1);
      return;
    }
    setPage(nextPage);
  });

  const openDetail = useMemoizedFn((record: AuditRecord) => {
    ctx.viewer.drawer({
      width: '50%',
      closable: true,
      content: () => <AuditLogDetailDrawer record={record} />,
    });
  });

  const columns = useMemo<ColumnsType<AuditRecord>>(
    () => [
      {
        title: t('Created at'),
        dataIndex: 'createdAt',
        width: 180,
        render: (value: string) => formatDate(value),
      },
      {
        title: t('User ID'),
        dataIndex: 'userId',
        width: 100,
      },
      {
        title: t('Role'),
        dataIndex: 'roleName',
        width: 120,
      },
      {
        title: t('Resource'),
        dataIndex: 'resource',
        width: 160,
      },
      {
        title: t('Action'),
        dataIndex: 'action',
        width: 140,
        render: (value: string) => (value ? <Tag>{value}</Tag> : null),
      },
      {
        title: t('Status'),
        dataIndex: 'status',
        width: 90,
        render: (value?: number) => (value != null ? <Tag color={value < 400 ? 'green' : 'red'}>{value}</Tag> : null),
      },
      {
        title: t('IP'),
        dataIndex: 'ip',
        width: 140,
        ellipsis: true,
      },
      {
        title: t('Actions'),
        width: 90,
        render: (_, record) => (
          <Space>
            <a onClick={() => openDetail(record)}>{t('View')}</a>
          </Space>
        ),
      },
    ],
    [openDetail, t],
  );

  // Preset audit-analysis tasks handed to the Auditor AI employee. Each task
  // auto-sends a prompt; the employee loads the `audit-analysis` skill (which
  // queries auditTrails:list itself), so the page does not pre-fetch data.
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
    <Card variant="borderless">
      <Flex justify="space-between" style={{ marginBottom: token.margin }}>
        <CollectionFilter
          collection={filterCollection}
          nonfilterableFieldNames={NON_FILTERABLE_FIELD_NAMES}
          onChange={setFilterPayload}
          t={t}
        />
        <Space>
          <AIEmployeeShortcut
            aiEmployee={{ username: 'auditor' }}
            tasks={tasks}
            size={32}
            mask={false}
            onClick={openAuditorChat}
            onTaskClick={triggerAuditorTask}
          />
          <Button icon={<ReloadOutlined />} onClick={() => refresh()}>
            {t('Refresh')}
          </Button>
        </Space>
      </Flex>
      <Table<AuditRecord>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data?.records || []}
        showIndex={false}
        pagination={{
          current: page,
          pageSize,
          total: data?.total || 0,
          onChange: handlePaginationChange,
        }}
      />
    </Card>
  );
}

export default function AuditLogsPage() {
  return (
    <ExtendCollectionsProvider collections={[auditTrailsCollection]}>
      <AuditLogsPageInner />
    </ExtendCollectionsProvider>
  );
}
