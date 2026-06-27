/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * RelatedApprovalsModel — the v2 (FlowEngine) model class backing the
 * "审批" tab's related-approvals list block on a business record detail page.
 *
 * The tab's flowModel is stored with `use: 'RelatedApprovalsModel'` in the data
 * source. Without this class registered on the client FlowEngine, instantiating
 * that model throws: "Model class 'RelatedApprovalsModel' not found. Please
 * register it first." — which is the error shown in the 审批 tab.
 *
 * This model reads the current record (collectionName + filterByTk) from the
 * page view input args, fetches the related approvals from the server-side
 * `<collection>/:id/relatedApprovals:list` action, exposes them as `items`, and
 * renders a simple read-only list.
 */

import { observable } from '@formily/reactive';
import { BlockModel } from '@nocobase/client';
import { Empty, Skeleton, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import React from 'react';

const DATE_FORMAT = 'YYYY-MM-DD HH:mm';

/** Human-readable label for the reverse-engineered approval status enum. */
function statusTag(status: number): { color: string; text: string } {
  switch (status) {
    case 1:
      return { color: 'processing', text: 'In progress' };
    case 2:
      return { color: 'success', text: 'Finished' };
    case -1:
      return { color: 'default', text: 'Withdrawn' };
    default:
      return { color: 'default', text: String(status) };
  }
}

export class RelatedApprovalsModel extends BlockModel {
  /** Loaded approval rows (observable array; mutate in place to trigger renders). */
  items: any[] = observable([]);
  private loading = observable.box(false);

  onInit(options: any): void {
    super.onInit?.(options);
    // Fetch once the model is attached to a context. onInit is sync, so we kick
    // the async load off and let it populate `items` (observable) when done.
    void this.loadItems();
  }

  /** Resolve the current business record from the page view and fetch approvals. */
  async loadItems() {
    const inputArgs = this.context?.view?.inputArgs ?? {};
    const collectionName: string | undefined =
      this.props?.collectionName || inputArgs.collectionName || inputArgs.associatedName;
    const recordId: string | undefined = this.props?.sourceId || inputArgs.filterByTk || inputArgs.sourceId;
    if (!collectionName || !recordId) {
      return;
    }
    this.loading.set(true);
    try {
      const resp = await this.context.api.request({
        url: `${collectionName}/${recordId}/relatedApprovals:list`,
        method: 'get',
        params: { pageSize: 50 },
      });
      const data = resp?.data?.data ?? resp?.data?.data?.data ?? [];
      const rows = Array.isArray(data) ? data : [];
      // Mutate the observable array in place so formily-reactive notifies
      // the model's reactive render and the table re-renders.
      this.items.splice(0, this.items.length, ...rows);
    } catch {
      this.items.splice(0, this.items.length);
    } finally {
      this.loading.set(false);
    }
  }

  render() {
    const self = this;
    const View = React.memo(() => {
      if (self.loading.get()) {
        return <Skeleton active />;
      }
      if (!self.items || self.items.length === 0) {
        return <Empty />;
      }
      const columns = [
        {
          title: 'Status',
          dataIndex: 'status',
          key: 'status',
          width: 120,
          render: (s: number) => {
            const t = statusTag(s);
            return <Tag color={t.color}>{t.text}</Tag>;
          },
        },
        {
          title: 'Workflow',
          dataIndex: 'workflowKey',
          key: 'workflowKey',
          width: 120,
        },
        {
          title: 'Applicant role',
          dataIndex: 'applicantRoleName',
          key: 'applicantRoleName',
        },
        {
          title: 'Created',
          dataIndex: 'createdAt',
          key: 'createdAt',
          render: (v: string) => (v ? dayjs(v).format(DATE_FORMAT) : ''),
        },
      ];
      return <Table rowKey="id" size="small" columns={columns} dataSource={self.items} pagination={false} />;
    });
    View.displayName = 'RelatedApprovalsView';
    return React.createElement(View);
  }
}

export default RelatedApprovalsModel;
// trigger rebuild
