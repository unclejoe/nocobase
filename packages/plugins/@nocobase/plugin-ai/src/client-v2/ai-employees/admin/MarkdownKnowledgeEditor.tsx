/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useFlowContext } from '@nocobase/flow-engine';
import { Button, Form, message, Switch, Typography } from 'antd';
import React, { useEffect, useState } from 'react';
import { useAIConfigRepository } from '../../repositories/hooks/useAIConfigRepository';
import { useT } from './useT';
import { MarkdownKnowledgeVditorField } from './MarkdownKnowledgeVditorField';
import type { AIEmployee } from '../types';

const { Paragraph } = Typography;

type FormShape = {
  markdownKnowledgeEnabled: boolean;
  markdownKnowledge?: string;
};

/**
 * v2-runtime editor for an AI employee's Layer 1 markdown knowledge.
 *
 * Scope note: the v1 runtime (`src/client/ai-employees/admin/`) hosts the full
 * 8-tab AI employee admin form (built on formily + `SchemaComponent`). The v2
 * runtime has no admin/edit page yet, so this component provides a focused,
 * self-contained v2 surface that lets an admin edit just the
 * `markdownKnowledgeEnabled` switch and the `markdownKnowledge` markdown body
 * for a given employee — backed by the `aiEmployees` resource via the
 * flow-engine context. It follows v2 conventions: plain antd `Form`, the
 * `useFlowContext()` API client, and a `useGlobalTheme()`-aware editor
 * (handled inside `MarkdownKnowledgeVditorField`).
 *
 * The editor is hidden when the switch is off. No neutral colors are
 * hardcoded — the switch uses antd's semantic color and the editor chrome is
 * driven entirely by vditor's theme.
 */
export const MarkdownKnowledgeEditor: React.FC<{
  /** Username (filter target key) of the AI employee being edited. */
  username: string;
  /** Optional inline layout (default vertical). */
  layout?: 'horizontal' | 'vertical' | 'inline';
}> = ({ username, layout = 'vertical' }) => {
  const t = useT();
  const ctx = useFlowContext();
  const aiConfigRepository = useAIConfigRepository();
  const [form] = Form.useForm<FormShape>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const apiLocale = ctx?.app?.apiClient?.auth?.locale;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!username) return;
      setLoading(true);
      try {
        const response = await ctx.app.apiClient.resource('aiEmployees').list({
          filter: { username },
          pageSize: 1,
        });
        const record: AIEmployee | undefined = response?.data?.data?.[0];
        if (cancelled || !record) return;
        const next: FormShape = {
          markdownKnowledgeEnabled: !!record.markdownKnowledgeEnabled,
          markdownKnowledge: record.markdownKnowledge ?? '',
        };
        form.setFieldsValue(next);
        setEnabled(next.markdownKnowledgeEnabled);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [ctx, username, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await ctx.app.apiClient.resource('aiEmployees').update({
        filterByTk: username,
        values: {
          markdownKnowledgeEnabled: values.markdownKnowledgeEnabled,
          markdownKnowledge: values.markdownKnowledge ?? '',
        },
      });
      await aiConfigRepository.refreshAIEmployees();
      message.success(t('Saved successfully', { ns: ['@nocobase/plugin-ai', 'client'] }));
    } catch (err) {
      // validateFields throws on validation failure; only surface real API errors.
      if (err?.errorFields?.length) {
        return;
      }
      message.error(t('Save failed', { ns: ['@nocobase/plugin-ai', 'client'] }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <Form<FormShape>
        form={form}
        layout={layout}
        onValuesChange={(changed) => {
          if ('markdownKnowledgeEnabled' in changed) {
            setEnabled(!!changed.markdownKnowledgeEnabled);
          }
        }}
        disabled={loading || saving}
        preserve={false}
      >
        <Form.Item
          name="markdownKnowledgeEnabled"
          label={t('Enable Markdown Knowledge', { ns: ['@nocobase/plugin-ai', 'client'] })}
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        {enabled ? (
          <>
            <Paragraph type="secondary" style={{ marginBottom: 8 }}>
              {t('markdown knowledge description', { ns: ['@nocobase/plugin-ai', 'client'] })}
            </Paragraph>
            <Form.Item
              name="markdownKnowledge"
              label={t('Markdown Knowledge', { ns: ['@nocobase/plugin-ai', 'client'] })}
            >
              <MarkdownKnowledgeVditorField locale={apiLocale} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" loading={saving} onClick={handleSave}>
                {t('Submit', { ns: 'client' })}
              </Button>
            </Form.Item>
          </>
        ) : null}
      </Form>
    </div>
  );
};

export default MarkdownKnowledgeEditor;
