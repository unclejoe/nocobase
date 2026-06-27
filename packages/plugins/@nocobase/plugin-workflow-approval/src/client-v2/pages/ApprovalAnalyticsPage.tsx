/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * v2 Approval Analytics page — placeholder summary view.
 *
 * The full analytics (throughput trend, bottleneck latency, approver load) are
 * powered by the `approval-analytics` AI skill (phase 3). This page renders a
 * basic summary of approval counts by status, which the AI assistant can build
 * on when asked "审批效率如何".
 */

import { DEFAULT_PAGE_SIZE } from '@nocobase/client-v2';
import { useFlowContext } from '@nocobase/flow-engine';
import { useRequest } from 'ahooks';
import { Card, Col, Row, Statistic } from 'antd';
import React from 'react';

import { APPROVAL_COLLECTION, APPROVAL_RECORD_COLLECTION, APPROVAL_RECORD_STATUS } from '../../common/constants';
import { useT } from '../locale';

export default function ApprovalAnalyticsPage() {
  const t = useT();
  const { api } = useFlowContext();

  const { data: approvals } = useRequest(async () => {
    const resp = await api.resource(APPROVAL_COLLECTION).list({ pageSize: DEFAULT_PAGE_SIZE });
    return resp.data;
  });

  const { data: pending } = useRequest(async () => {
    const resp = await api.resource(APPROVAL_RECORD_COLLECTION).list({
      pageSize: 1,
      filter: { status: APPROVAL_RECORD_STATUS.PENDING },
    });
    return resp.data;
  });

  const total = approvals?.meta?.count ?? 0;
  const pendingCount = pending?.meta?.count ?? 0;

  return (
    <Row gutter={16}>
      <Col span={8}>
        <Card>
          <Statistic title={t('Approvals')} value={total} />
        </Card>
      </Col>
      <Col span={8}>
        <Card>
          <Statistic title={t('Pending')} value={pendingCount} />
        </Card>
      </Col>
    </Row>
  );
}
