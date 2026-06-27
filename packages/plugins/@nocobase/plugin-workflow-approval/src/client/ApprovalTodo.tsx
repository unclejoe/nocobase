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
import { Button, Drawer, Input, Space, Timeline, Typography, message } from 'antd';
import { APPROVAL_RECORD_COLLECTION, APPROVAL_RECORD_STATUS, TASK_TYPE_APPROVAL } from '../common/constants';
import { lang, NAMESPACE, usePluginTranslation } from '../locale';

const { Text } = Typography;

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

export function ApprovalDetail({ record, onClose }: { record: any; onClose: () => void }) {
  const api = useAPIClient();
  const { t } = usePluginTranslation();
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
        items={(record.approval?.records ?? []).map((r: any) => ({
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
        <Button loading={busy} onClick={() => act('returnBack')}>
          {t('Return')}
        </Button>
      </Space>
    </Drawer>
  );
}

/** TaskTypeOptions — registered with workflow.registerTaskType. */
export const approvalTodo = {
  key: TASK_TYPE_APPROVAL,
  title: `{{t("My pending approvals", { ns: "${NAMESPACE}" })}}`,
  collection: APPROVAL_RECORD_COLLECTION,
  action: 'listMine',
  Item: ({ data, onOpen }) => (
    <Button type="link" onClick={onOpen}>
      {data.title}
    </Button>
  ),
  Detail: ApprovalDetail,
};

export default approvalTodo;
