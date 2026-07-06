/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useFlowContext } from '@nocobase/flow-engine';
import { useRequest } from 'ahooks';
import { Card, Empty, Select, Space, Spin, Typography } from 'antd';
import React from 'react';
import { MarkdownKnowledgeEditor } from './MarkdownKnowledgeEditor';
import { useT } from './useT';
import type { AIEmployee } from '../types';

const { Title, Paragraph } = Typography;

/**
 * v2 plugin-settings page that exposes the Layer 1 markdown knowledge editor.
 *
 * The v2 runtime has no AI employee admin/edit page yet (the full 8-tab
 * formily form lives in the v1 runtime). To give v2 users a *usable* markdown
 * knowledge entry — the objective's explicit requirement — this page lists all
 * AI employees and renders {@link MarkdownKnowledgeEditor} for the selected
 * one. It follows the v2 conventions used by `plugin-acl`'s
 * `RolesManagementPage`: `useFlowContext()` for the API client, plain antd
 * components, and the app i18n namespace.
 *
 * Theme: no neutral colors are hardcoded — the card surface, text and the
 * editor chrome all derive from antd design tokens / vditor's theme.
 */
function MarkdownKnowledgePage() {
  const t = useT();
  const ctx = useFlowContext();
  const [selectedUsername, setSelectedUsername] = React.useState<string | undefined>(undefined);

  // Load the full list of AI employees so the admin can pick one to edit.
  const { data: employees = [], loading } = useRequest(async (): Promise<AIEmployee[]> => {
    const response = await ctx.app.apiClient.resource('aiEmployees').list({ pageSize: 200 });
    return response?.data?.data || [];
  });

  const selectOptions = employees.map((emp) => ({
    label: emp.nickname ? `${emp.nickname} (${emp.username})` : emp.username,
    value: emp.username,
  }));

  return (
    <Card bordered={false}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={4} style={{ marginTop: 0 }}>
            {t('Markdown Knowledge')}
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t('markdown knowledge description')}
          </Paragraph>
        </div>
        <div>
          <label htmlFor="mk-employee-select" style={{ marginRight: 8 }}>
            {t('AI employee')}
          </label>
          <Select
            id="mk-employee-select"
            style={{ minWidth: 280 }}
            placeholder={t('Please select')}
            showSearch
            optionFilterProp="label"
            options={selectOptions}
            loading={loading}
            value={selectedUsername}
            onChange={setSelectedUsername}
          />
        </div>
        {loading ? (
          <Spin />
        ) : selectedUsername ? (
          <MarkdownKnowledgeEditor key={selectedUsername} username={selectedUsername} />
        ) : (
          <Empty description={t('Please select')} />
        )}
      </Space>
    </Card>
  );
}

export default MarkdownKnowledgePage;
