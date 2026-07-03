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
import { Button, Drawer, Input, Modal, Select, Space, Tabs, Timeline, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import React, { useState } from 'react';

import {
  APPROVAL_COLLECTION,
  APPROVAL_RECORD_COLLECTION,
  APPROVAL_RECORD_STATUS,
  APPROVAL_STATUS,
} from '../../common/constants';
import { NAMESPACE } from '../../common/constants';
import { FieldDiff } from '../components/FieldDiff';
import { useT } from '../locale';

const { Text } = Typography;
const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';

type ApprovalRecord = {
  id: number | string;
  title?: string;
  status?: number;
  comment?: string;
  changes?: unknown;
  userId?: number;
  approvalId?: number;
  createdAt?: string;
  approval?: { data?: Record<string, unknown>; records?: ApprovalRecord[] };
};

type ApprovalSubmission = {
  id: number | string;
  status?: number;
  collectionName?: string;
  dataKey?: string;
  createdAt?: string;
  data?: Record<string, unknown>;
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

function approvalStatusLabel(status: number | undefined, t: (k: string) => string): string {
  switch (status) {
    case APPROVAL_STATUS.IN_PROGRESS:
      return t('In progress');
    case APPROVAL_STATUS.FINISHED:
      return t('Finished');
    case APPROVAL_STATUS.WITHDRAWN:
      return t('Withdrawn');
    default:
      return status == null ? '' : String(status);
  }
}

function ApprovalDetail({ record, onClose }: { record: ApprovalRecord; onClose: () => void }) {
  const t = useT();
  const { api } = useFlowContext();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [returnTargets, setReturnTargets] = useState<{ key: string; title: string }[] | null>(null);
  const [returnTarget, setReturnTarget] = useState<string | undefined>(undefined);

  const act = async (action: 'approve' | 'reject' | 'returnBack', extra?: { returnToNodeKey?: string }) => {
    setBusy(true);
    try {
      await api.resource('approvals', record.id)[action]({
        values: { comment, ...(extra?.returnToNodeKey ? { returnToNodeKey: extra.returnToNodeKey } : {}) },
      });
      message.success(t('Approval submitted successfully'));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // Return flow (§4.3 / backlog #6): ask the server which nodes the approver
  // may return to. When only the implicit default exists (no upstream nodes),
  // return immediately as before; otherwise pop a small selector.
  const onReturn = async () => {
    if (returnTargets !== null) {
      setReturnTargets(null);
      return;
    }
    setBusy(true);
    try {
      const resp = await api.resource('approvals', record.id).returnableNodes();
      const nodes: { key: string; title: string }[] = resp?.data?.data ?? [];
      if (nodes.length === 0) {
        await act('returnBack');
      } else {
        setReturnTargets(nodes);
        setReturnTarget(nodes[0]?.key);
      }
    } finally {
      setBusy(false);
    }
  };

  const records = record.approval?.records ?? [];
  // Business snapshot stored on the approval (§4.2). Render a compact summary.
  const snapshot: Record<string, unknown> | undefined = record.approval?.data;
  const snapshotRows = snapshot
    ? Object.entries(snapshot)
        .filter(([k, v]) => !['data', 'action'].includes(k) && v != null && typeof v !== 'object')
        .slice(0, 12)
    : [];

  return (
    <Drawer open width={520} onClose={onClose} title={t('Approval records')}>
      {snapshotRows.length > 0 ? (
        <>
          <Text strong>{t('Business snapshot')}</Text>
          <div style={{ margin: '8px 0 16px' }}>
            {snapshotRows.map(([k, v]) => (
              <div key={k}>
                <Text type="secondary">{k}:</Text> <Text>{String(v)}</Text>
              </div>
            ))}
          </div>
        </>
      ) : null}
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
              {/* Field-level change diff (§4.2): populated by the resubmit action. */}
              <FieldDiff changes={r.changes} />
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
        <Button loading={busy} onClick={onReturn}>
          {t('Return')}
        </Button>
      </Space>
      <Modal
        open={returnTargets !== null}
        title={t('Return to')}
        okText={t('Return')}
        cancelText={t('Cancel')}
        onCancel={() => setReturnTargets(null)}
        confirmLoading={busy}
        onOk={() => {
          const key = returnTarget;
          setReturnTargets(null);
          return act('returnBack', key ? { returnToNodeKey: key } : undefined);
        }}
      >
        <div style={{ marginBottom: 8 }}>{t('Select return target node')}</div>
        <Select
          style={{ width: '100%' }}
          value={returnTarget}
          onChange={setReturnTarget}
          options={(returnTargets ?? []).map((n) => ({ label: n.title || n.key, value: n.key }))}
          aria-label={t('Return to')}
        />
      </Modal>
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
        <DrawerFormLayout title={t('Approval detail')}>
          {selected ? <ApprovalDetail record={selected} onClose={() => setOpen(false)} /> : null}
        </DrawerFormLayout>
      </Drawer>
    </>
  );
}

/**
 * Applicant's "My submissions" tab. Lists approvals created by the current user
 * and exposes a "Resubmit" action when an approval has been returned (§8.3).
 *
 * The resubmit button is shown for approvals in IN_PROGRESS that have at least
 * one returned record. The server re-checks ownership + state, so a stale UI
 * cannot trigger an invalid resubmit.
 */
function SubmissionTable() {
  const t = useT();
  const { api } = useFlowContext();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ApprovalSubmission | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { data, loading } = useRequest(
    async () => {
      const resp = await api.resource(APPROVAL_COLLECTION).listSubmitted({
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        sort: ['-createdAt'],
      });
      return resp.data;
    },
    { refreshDeps: [page, reloadKey] },
  );

  const resubmit = async () => {
    if (!selected) {
      return;
    }
    setBusy(true);
    try {
      await api.resource(APPROVAL_COLLECTION, selected.id).resubmit();
      message.success(t('Approval resubmitted'));
      setOpen(false);
      setReloadKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!selected) {
      return;
    }
    setBusy(true);
    try {
      await api.resource(APPROVAL_COLLECTION, selected.id).withdraw();
      message.success(t('Approval withdrawn'));
      setOpen(false);
      setReloadKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<ApprovalSubmission> = [
    {
      title: t('Approval status'),
      dataIndex: 'status',
      key: 'status',
      render: (s: number | undefined) => approvalStatusLabel(s, t),
    },
    {
      title: t('Collection'),
      dataIndex: 'collectionName',
      key: 'collectionName',
    },
    { title: t('Data key'), dataIndex: 'dataKey', key: 'dataKey' },
    {
      title: t('Created at'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => (v ? dayjs(v).format(DATE_FORMAT) : ''),
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

  // A returned approval is IN_PROGRESS; the precise "has returned record" check
  // happens server-side, so we offer the button for any IN_PROGRESS approval and
  // surface the server error if the applicant acts on a stale row.
  const canResubmit = selected?.status === APPROVAL_STATUS.IN_PROGRESS;

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
      <Drawer open={open} onClose={() => setOpen(false)} width={520} title={t('Approval records')}>
        <DrawerFormLayout title={t('Approval records')}>
          {selected ? (
            <>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text type="secondary">{t('Approval status')}: </Text>
                  <Text>{approvalStatusLabel(selected.status, t)}</Text>
                </div>
                <div>
                  <Text type="secondary">{t('Collection')}: </Text>
                  <Text>{selected.collectionName ?? ''}</Text>
                </div>
                <div>
                  <Text type="secondary">{t('Data key')}: </Text>
                  <Text>{selected.dataKey ?? ''}</Text>
                </div>
              </Space>
              {canResubmit ? (
                <Space style={{ marginTop: 16 }}>
                  <Button type="primary" loading={busy} onClick={resubmit}>
                    {t('Resubmit')}
                  </Button>
                  <Button danger loading={busy} onClick={withdraw}>
                    {t('Withdraw')}
                  </Button>
                </Space>
              ) : null}
            </>
          ) : null}
        </DrawerFormLayout>
      </Drawer>
    </>
  );
}

export default function ApprovalsCenterPage() {
  const t = useT();
  return (
    <ExtendCollectionsProvider collections={[{ name: APPROVAL_RECORD_COLLECTION }, { name: APPROVAL_COLLECTION }]}>
      <Tabs
        defaultActiveKey="pending"
        items={[
          { key: 'pending', label: t('Pending'), children: <RecordTable status={APPROVAL_RECORD_STATUS.PENDING} /> },
          {
            key: 'processed',
            label: t('Processed'),
            children: <RecordTable status={APPROVAL_RECORD_STATUS.APPROVED} />,
          },
          {
            key: 'submissions',
            label: t('My submissions'),
            children: <SubmissionTable />,
          },
        ]}
      />
    </ExtendCollectionsProvider>
  );
}
