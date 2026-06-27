/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * v2 Approval Center page — lists the current user's pending and processed
 * approval records, with a detail drawer for approve/reject/return.
 */

import { DEFAULT_PAGE_SIZE, DrawerFormLayout, ExtendCollectionsProvider, Table } from '@nocobase/client-v2';
import { useFlowContext } from '@nocobase/flow-engine';
import { useRequest } from 'ahooks';
import { Button, Drawer, Input, Space, Tabs, Timeline, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import React, { useState } from 'react';

import { APPROVAL_RECORD_COLLECTION, APPROVAL_RECORD_STATUS } from '../../common/constants';
import { NAMESPACE } from '../../common/constants';
import { useT } from '../locale';

const { Text } = Typography;
const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';

type ApprovalRecord = {
  id: number | string;
  title?: string;
  status?: number;
  comment?: string;
  userId?: number;
  approvalId?: number;
  createdAt?: string;
  approval?: { data?: Record<string, unknown>; records?: ApprovalRecord[] };
};

function statusLabel(status: number, t: (k: string) => string): string {
  switch (status) {
    case APPROVAL_RECORD_STATUS.PENDING:
      return t('Pending');
    case APPROVAL_RECORD_STATUS.APPROVED:
      return t('Approve');
    case APPROVAL_RECORD_STATUS.INVALID:
      return t('Reject');
    case APPROVAL_RECORD_STATUS.NOTIFIED:
      return t('Processed');
    default:
      return String(status);
  }
}

function ApprovalDetail({ record, onClose }: { record: ApprovalRecord; onClose: () => void }) {
  const t = useT();
  const { api } = useFlowContext();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (action: 'approve' | 'reject' | 'returnBack') => {
    setBusy(true);
    try {
      await api.resource('approvals', record.id)[action]({ values: { comment } });
      message.success(t('Approval submitted successfully'));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const records = record.approval?.records ?? [];

  return (
    <Drawer open width={520} onClose={onClose} title={t('Approval records')}>
      <Timeline
        items={records.map((r) => ({
          color: r.status === APPROVAL_RECORD_STATUS.APPROVED ? 'green' : (r.status ?? 0) < 0 ? 'red' : 'blue',
          children: (
            <div>
              <Text strong>{r.userId}</Text> — {statusLabel(r.status ?? 0, t)}
              {r.comment ? (
                <div>
                  <Text type="secondary">{r.comment}</Text>
                </div>
              ) : null}
            </div>
          ),
        }))}
      />
      <Input.TextArea
        aria-label={t('Comment')}
        placeholder={t('Comment')}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        style={{ margin: '12px 0' }}
      />
      <Space>
        <Button type="primary" loading={busy} onClick={() => act('approve')}>
          {t('Approve')}
        </Button>
        <Button danger loading={busy} onClick={() => act('reject')}>
          {t('Reject')}
        </Button>
        <Button loading={busy} onClick={() => act('returnBack')}>
          {t('Return')}
        </Button>
      </Space>
    </Drawer>
  );
}

function RecordTable({ status }: { status: number }) {
  const t = useT();
  const { api } = useFlowContext();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ApprovalRecord | null>(null);

  const { data, loading } = useRequest(
    async () => {
      const resp = await api.resource(APPROVAL_RECORD_COLLECTION).list({
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        filter: { status },
        appends: ['approval'],
        sort: ['-createdAt'],
      });
      return resp.data;
    },
    { refreshDeps: [page, status] },
  );

  const columns: ColumnsType<ApprovalRecord> = [
    { title: t('Approver'), dataIndex: 'userId', key: 'userId' },
    { title: t('Approval status'), dataIndex: 'status', key: 'status', render: (s) => statusLabel(s, t) },
    {
      title: t('Applicant'),
      key: 'createdAt',
      render: (_, r) => (r.createdAt ? dayjs(r.createdAt).format(DATE_FORMAT) : ''),
    },
    {
      title: '',
      key: 'action',
      render: (_, r) => (
        <Button
          type="link"
          onClick={() => {
            setSelected(r);
            setOpen(true);
          }}
        >
          {t('Approval records')}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Table
        loading={loading}
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="id"
        pagination={{
          current: page,
          pageSize: DEFAULT_PAGE_SIZE,
          total: data?.meta?.count ?? 0,
          onChange: setPage,
        }}
      />
      <Drawer open={open} onClose={() => setOpen(false)} width={520}>
        <DrawerFormLayout>
          {selected ? <ApprovalDetail record={selected} onClose={() => setOpen(false)} /> : null}
        </DrawerFormLayout>
      </Drawer>
    </>
  );
}

export default function ApprovalsCenterPage() {
  const t = useT();
  return (
    <ExtendCollectionsProvider collections={[APPROVAL_RECORD_COLLECTION]}>
      <Tabs
        defaultActiveKey="pending"
        items={[
          { key: 'pending', label: t('Pending'), children: <RecordTable status={APPROVAL_RECORD_STATUS.PENDING} /> },
          {
            key: 'processed',
            label: t('Processed'),
            children: <RecordTable status={APPROVAL_RECORD_STATUS.APPROVED} />,
          },
        ]}
      />
    </ExtendCollectionsProvider>
  );
}
