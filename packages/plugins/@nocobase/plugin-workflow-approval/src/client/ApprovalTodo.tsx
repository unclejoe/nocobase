/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * v1 approval task-center entry + todo detail drawer.
 *
 * registerTaskType plugs into the existing workflow task center as a new tab.
 * The Detail drawer renders the approval records (audit chain) with
 * approve / reject / return actions for the current approver.
 */

import React, { useState } from 'react';
import { useAPIClient } from '@nocobase/client';
import { Button, Input, Modal, Select, Space, Timeline, Typography, message } from 'antd';
import { APPROVAL_RECORD_COLLECTION, APPROVAL_RECORD_STATUS, TASK_TYPE_APPROVAL } from '../common/constants';
import { lang, NAMESPACE, usePluginTranslation } from '../locale';

const { Text } = Typography;

/** A compact approval-record row as used by the v1 todo detail drawer. */
interface ApprovalRecordRow {
  id: number | string;
  status: number;
  userId?: number;
  comment?: string;
  changes?: unknown;
  user?: { nickname?: string };
  approval?: { data?: Record<string, unknown>; records?: ApprovalRecordRow[] };
}

/** Human-readable label for an approval record status (reverse-engineered enum). */
function statusLabel(status: number): string {
  switch (status) {
    case APPROVAL_RECORD_STATUS.PENDING:
      return lang('Pending');
    case APPROVAL_RECORD_STATUS.APPROVED:
      return lang('Approve');
    case APPROVAL_RECORD_STATUS.INVALID:
      return lang('Reject');
    case APPROVAL_RECORD_STATUS.NOTIFIED:
      return lang('Processed');
    default:
      return String(status);
  }
}

export function ApprovalDetail({ record, onClose }: { record: ApprovalRecordRow; onClose: () => void }) {
  const api = useAPIClient();
  const { t } = usePluginTranslation();
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
  // may return to, then either return immediately (no upstream) or show a picker.
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

  const snapshot: Record<string, unknown> | undefined = record.approval?.data;
  const snapshotRows = snapshot
    ? Object.entries(snapshot)
        .filter(([k, v]) => !['data', 'action'].includes(k) && v != null && typeof v !== 'object')
        .slice(0, 12)
    : [];

  return (
    <div>
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
        items={(record.approval?.records ?? []).map((r: ApprovalRecordRow) => ({
          color: r.status === APPROVAL_RECORD_STATUS.APPROVED ? 'green' : r.status < 0 ? 'red' : 'blue',
          children: (
            <div>
              <Text strong>{r.user?.nickname ?? r.userId}</Text> — {statusLabel(r.status)}
              {r.comment ? (
                <div>
                  <Text type="secondary">{r.comment}</Text>
                </div>
              ) : null}
              {r.changes ? (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" code>
                    {JSON.stringify(r.changes)}
                  </Text>
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
    </div>
  );
}

/** TaskTypeOptions — registered with workflow.registerTaskType. */
// Item/Detail are rendered as Formily schema components, where props arrive via
// the schema/x-component context rather than typed React props. The shared
// TaskTypeOptions type declares them as React.ComponentType (i.e. accepting
// { children? }), so the component bodies read their inputs from a loose bag.
export const approvalTodo = {
  key: TASK_TYPE_APPROVAL,
  title: `{{t("My pending approvals", { ns: "${NAMESPACE}" })}}`,
  collection: APPROVAL_RECORD_COLLECTION,
  action: 'listMine',
  // workflow task center calls useActionParams(status) to obtain the list filter
  // for the active tab. Pending tab shows records awaiting this user's action;
  // the history tab shows everything for this user. status: 'pending' | 'history'
  useActionParams: (status: string) => ({
    filter: status === 'history' ? {} : { status: APPROVAL_RECORD_STATUS.PENDING },
  }),
  Item: ({ data, onOpen }: Record<string, unknown>) => (
    <Button type="link" onClick={onOpen as (() => void) | undefined}>
      {(data as { title?: string })?.title}
    </Button>
  ),
  Detail: ApprovalDetail as React.ComponentType,
};

export default approvalTodo;
