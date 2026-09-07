/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * v1 (SchemaComponent) Approval Center page.
 *
 * The v2 client registers its center via the new two-layer pluginSettingsManager,
 * which is decoupled from this app's v1 settings registry — so the "Approval
 * center" menu never appears. This v1 page mirrors the v2 ApprovalsCenterPage
 * (待办 / 已处理 / 我的申请 tabs) but is built purely on @nocobase/client +
 * antd, so it can be registered through the v1 pluginSettingsManager and render
 * without any v2 FlowEngine context.
 *
 * Reuses {@link ApprovalDetail} for the per-record decision drawer.
 */

import React, { useEffect, useState } from 'react';
import { useAPIClient } from '@nocobase/client';
import { useRequest } from 'ahooks';
import { Button, Drawer, Space, Table, Tabs, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

import {
  APPROVAL_COLLECTION,
  APPROVAL_RECORD_COLLECTION,
  APPROVAL_RECORD_STATUS,
  APPROVAL_STATUS,
} from '../common/constants';
import { usePluginTranslation } from '../locale';
import { ApprovalDetail } from './ApprovalTodo';

const { Text } = Typography;
const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const PAGE_SIZE = 10;

/** A pending / processed approval-record row (approver view). */
interface ApprovalRecordRow {
  id: number | string;
  status: number;
  userId?: number;
  comment?: string;
  approvalId?: number;
  createdAt?: string;
  user?: { nickname?: string };
  approval?: { data?: Record<string, unknown>; records?: ApprovalRecordRow[] };
}

/** An approval submitted by the current user (applicant view). */
interface ApprovalSubmissionRow {
  id: number | string;
  status?: number;
  collectionName?: string;
  dataKey?: string;
  createdAt?: string;
}

function useStatusLabel() {
  const { t } = usePluginTranslation();
  const recordLabel = (status: number): string => {
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
  };
  const approvalLabel = (status: number | undefined): string => {
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
  };
  return { recordLabel, approvalLabel };
}

/** Approver tab: lists approval records assigned to the current user. */
function RecordTable({ status }: { status: number }) {
  const { t } = usePluginTranslation();
  const api = useAPIClient();
  const { recordLabel } = useStatusLabel();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ApprovalRecordRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const { data, loading } = useRequest(
    async () => {
      const resp = await api.resource(APPROVAL_RECORD_COLLECTION).listMine({
        page,
        pageSize: PAGE_SIZE,
        filter: { status },
        appends: ['user', 'approval'],
        sort: ['-createdAt'],
      });
      return resp.data;
    },
    { refreshDeps: [page, status, reloadKey] },
  );

  const columns: ColumnsType<ApprovalRecordRow> = [
    {
      title: t('Approver'),
      dataIndex: 'userId',
      key: 'userId',
      render: (_, r) => r.user?.nickname ?? r.userId,
    },
    {
      title: t('Approval status'),
      dataIndex: 'status',
      key: 'status',
      render: (s: number) => recordLabel(s),
    },
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

  return (
    <>
      <Table
        loading={loading}
        columns={columns}
        dataSource={data?.data ?? []}
        rowKey="id"
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.meta?.count ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
      />
      <Drawer open={open} onClose={() => setOpen(false)} width={520} title={t('Approval records')}>
        {selected ? (
          <ApprovalDetail
            record={selected}
            onClose={() => {
              setOpen(false);
              setReloadKey((k) => k + 1);
            }}
          />
        ) : null}
      </Drawer>
    </>
  );
}

/** Applicant tab: lists approvals created by the current user, with resubmit / withdraw. */
function SubmissionTable() {
  const { t } = usePluginTranslation();
  const api = useAPIClient();
  const { approvalLabel } = useStatusLabel();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ApprovalSubmissionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { data, loading } = useRequest(
    async () => {
      const resp = await api.resource(APPROVAL_COLLECTION).listSubmitted({
        page,
        pageSize: PAGE_SIZE,
        sort: ['-createdAt'],
      });
      return resp.data;
    },
    { refreshDeps: [page, reloadKey] },
  );

  const reload = () => setReloadKey((k) => k + 1);

  const resubmit = async () => {
    if (!selected) {
      return;
    }
    setBusy(true);
    try {
      await api.resource(APPROVAL_COLLECTION, selected.id).resubmit();
      message.success(t('Approval resubmitted'));
      setOpen(false);
      reload();
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
      reload();
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<ApprovalSubmissionRow> = [
    {
      title: t('Approval status'),
      dataIndex: 'status',
      key: 'status',
      render: (s: number | undefined) => approvalLabel(s),
    },
    { title: t('Collection'), dataIndex: 'collectionName', key: 'collectionName' },
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

  // Offer resubmit / withdraw only while the approval is still in progress.
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
          pageSize: PAGE_SIZE,
          total: data?.meta?.count ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
      />
      <Drawer open={open} onClose={() => setOpen(false)} width={520} title={t('Approval records')}>
        {selected ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text type="secondary">{t('Approval status')}: </Text>
              <Text>{approvalLabel(selected.status)}</Text>
            </div>
            <div>
              <Text type="secondary">{t('Collection')}: </Text>
              <Text>{selected.collectionName ?? ''}</Text>
            </div>
            <div>
              <Text type="secondary">{t('Data key')}: </Text>
              <Text>{selected.dataKey ?? ''}</Text>
            </div>
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
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}

export default function ApprovalCenter() {
  const { t } = usePluginTranslation();
  // The route shell leaves document.title as "Loading..." (the ApprovalCenter page
  // is not a desktopRoutes-backed flowPage, so the layout never sets a title).
  // Set it explicitly so the browser tab reads correctly.
  useEffect(() => {
    const previous = document.title;
    document.title = t('Approval center');
    return () => {
      document.title = previous;
    };
  }, [t]);
  return (
    <Tabs
      defaultActiveKey="pending"
      items={[
        { key: 'pending', label: t('Pending'), children: <RecordTable status={APPROVAL_RECORD_STATUS.PENDING} /> },
        {
          key: 'processed',
          label: t('Processed'),
          children: <RecordTable status={APPROVAL_RECORD_STATUS.APPROVED} />,
        },
        { key: 'submissions', label: t('My submissions'), children: <SubmissionTable /> },
      ]}
    />
  );
}
