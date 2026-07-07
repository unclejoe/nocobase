/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React, { useEffect, useState } from 'react';
import { Form, Switch } from 'antd';
import { useForm } from '@formily/react';
import { observer } from '@nocobase/flow-engine';
import { useT } from '../../locale';
import { MarkdownKnowledgeEditor } from './MarkdownKnowledgeField';

/**
 * Layer 1 static knowledge settings for an AI employee.
 *
 * Renders an enable switch (`markdownKnowledgeEnabled`) and a markdown editor
 * (`markdownKnowledge`) backed by vditor. The editor is hidden when the switch
 * is off.
 *
 * Implementation note: the enable toggle and the editor visibility are driven
 * from local React state that is two-way synced with the shared Formily form
 * (the same form the rest of the AI employee edit drawer uses). We avoid
 * binding these two fields as separate Formily `x-component` fields because,
 * in this codebase's Formily build, schema-level reactions / `observer` reads
 * from a sibling `x-component` did not reliably re-render on switch toggle.
 * Reading and writing through `form.values` with an `observer` wrapper gives
 * deterministic reactivity (same pattern as `ModelSettings.tsx`).
 *
 * No neutral colors are hardcoded; the switch uses antd's semantic color and
 * the editor chrome is driven entirely by vditor's theme (selected to match
 * the active antd theme inside `MarkdownKnowledgeField`).
 */
export const MarkdownKnowledgeSettings: React.FC = observer(() => {
  const t = useT();
  const form = useForm();

  // Local mirror of the switch state, seeded from the form (which is seeded
  // from the record by `useEditFormProps` / `useCreateFormProps`).
  const [enabled, setEnabled] = useState<boolean>(form.values.markdownKnowledgeEnabled === true);

  // Keep the form value in sync whenever the local toggle changes so that the
  // submit handler persists it, and re-seed if the form value changes
  // externally (e.g. form reset).
  useEffect(() => {
    form.setValuesIn('markdownKnowledgeEnabled', enabled);
  }, [enabled, form]);

  // Re-seed local state if the form is reset / reloaded with a different value
  // than what we have locally.
  const formEnabled = form.values.markdownKnowledgeEnabled === true;
  useEffect(() => {
    setEnabled(formEnabled);
    // We intentionally only depend on the primitive formEnabled flag so this
    // does not fight the user's toggle in the same render cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formEnabled]);

  const markdownValue: string = (form.values.markdownKnowledge as string) ?? '';
  const handleEditorChange = (next: string) => {
    form.setValuesIn('markdownKnowledge', next);
  };

  return (
    <Form layout="vertical">
      <Form.Item label={t('Enable Markdown Knowledge')}>
        <Switch
          checked={enabled}
          onChange={(checked) => {
            setEnabled(checked);
            form.setValuesIn('markdownKnowledgeEnabled', checked);
          }}
        />
      </Form.Item>
      {enabled ? (
        <Form.Item label={t('Markdown Knowledge')} extra={t('markdown knowledge description')}>
          <MarkdownKnowledgeEditor value={markdownValue} onChange={handleEditorChange} />
        </Form.Item>
      ) : null}
    </Form>
  );
});
