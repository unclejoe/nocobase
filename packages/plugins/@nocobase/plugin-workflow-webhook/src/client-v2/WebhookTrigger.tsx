/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please see: https://www.nocobase.com/agreement.
 */

import {
  Trigger,
  useCurrentWorkflowContext,
  type LoaderOf,
  type VariableOption,
} from '@nocobase/plugin-workflow/client-v2';
import { Checkbox, Form, Input } from 'antd';
import React, { useEffect, useState } from 'react';

import { HTTP_METHODS, HTTP_METHOD_OPTIONS, NAMESPACE as COMMON_NAMESPACE } from '../common/constants';
import { jsonToVariableOptions } from '../client/jsonToVariableOptions';
import { useT } from './locale';

/**
 * Textarea that accepts JSON text. The form value is always a parsed value:
 * an object/array when the text is valid JSON, the raw string while it is not
 * (form-level validation blocks submitting invalid JSON). Internal text state
 * keeps typing smooth — the form value never feeds back into the textarea.
 */
function JsonTextarea({
  value,
  onChange,
  minRows = 4,
  maxRows = 12,
}: {
  value?: unknown;
  onChange?: (value: unknown) => void;
  minRows?: number;
  maxRows?: number;
}) {
  const [text, setText] = useState<string>(
    typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2),
  );

  useEffect(() => {
    // Sync only when the incoming value is a parsed form value that differs from what
    // our text currently represents (e.g. initial values loaded after mount). Uses the
    // updater form so the text state itself is not a dependency.
    setText((current) => {
      try {
        if (JSON.stringify(value ?? null) !== JSON.stringify(parse(current))) {
          return typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);
        }
      } catch {
        // keep current text while it is not valid JSON yet
      }
      return current;
    });
  }, [value]);

  return (
    <Input.TextArea
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        onChange?.(parse(next));
      }}
      autoSize={{ minRows, maxRows }}
      style={{ fontFamily: 'monospace' }}
    />
  );
}

function parse(text: string): unknown {
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function jsonValidator(t: (key: string) => string) {
  return {
    validator: (_: unknown, value: unknown) => {
      if (typeof value !== 'string') {
        return Promise.resolve();
      }
      // A string value means the text did not parse as JSON — unless it is quoted JSON.
      try {
        JSON.parse(value);
        return Promise.resolve();
      } catch {
        return Promise.reject(new Error(t('Invalid JSON')));
      }
    },
  };
}

function WebhookUrlDisplay() {
  const workflow = useCurrentWorkflowContext();
  const t = useT();
  const workflowKey = workflow?.key;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // Keep in sync with the server route: the webhook resource is registered as
  // `webhooks:trigger` and served at `/api/webhooks:trigger/<workflow key>`.
  const url = workflowKey ? `${origin}/api/webhooks:trigger/${workflowKey}` : '';

  if (!url) {
    return null;
  }

  return (
    <Form.Item label={t('Webhook URL')}>
      <Input.TextArea
        value={url}
        readOnly
        autoSize
        styles={{ textarea: { fontFamily: 'monospace', wordBreak: 'break-all' } }}
      />
      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.65 }}>
        {t('Send HTTP requests to this URL to trigger the workflow')}
      </div>
    </Form.Item>
  );
}

export function WebhookTriggerConfig() {
  const t = useT();

  return (
    <fieldset>
      <WebhookUrlDisplay />
      <Form.Item
        name={['config', 'methods']}
        label={t('Request methods')}
        extra={t('Allowed HTTP methods for this webhook endpoint')}
        initialValue={['POST']}
        rules={[{ required: true }]}
      >
        <Checkbox.Group options={HTTP_METHOD_OPTIONS} />
      </Form.Item>
      <Form.Item
        name={['config', 'bodySchema']}
        label={t('Request body sample')}
        extra={t(
          'Paste a JSON sample of the request body. Fields are parsed automatically and become selectable as trigger variables.',
        )}
        rules={[jsonValidator(t)]}
      >
        <JsonTextarea />
      </Form.Item>
      <Form.Item
        name={['config', 'secret']}
        label={t('Secret')}
        extra={t('Optional secret for request verification. Clients must send it in the x-webhook-secret header.')}
      >
        <Input.Password />
      </Form.Item>
    </fieldset>
  );
}

export function TriggerDataConfig() {
  const t = useT();

  return (
    <Form.Item
      name="data"
      label={t('Trigger data')}
      extra={t('Use JSON as trigger data for testing.')}
      rules={[jsonValidator(t)]}
    >
      <JsonTextarea />
    </Form.Item>
  );
}

function useVariables(config: Record<string, unknown>): VariableOption[] {
  const t = useT();

  // Parse the `bodySchema` JSON sample on demand (same as the v1 trigger). When a valid
  // sample is present, `data` becomes an expandable branch so node field-assignment
  // pickers can drill into `$trigger.data.amount` etc.; otherwise `data` is a leaf
  // exposing the whole body object (backward compatible).
  let bodyChildren: VariableOption[] | null = null;
  if (config?.bodySchema) {
    try {
      const parsed = typeof config.bodySchema === 'string' ? JSON.parse(config.bodySchema) : config.bodySchema;
      const vars = jsonToVariableOptions(parsed) as VariableOption[];
      bodyChildren = vars.length ? vars : null;
    } catch {
      // invalid JSON — leave bodyChildren null (leaf)
    }
  }

  return [
    {
      label: t('Trigger data'),
      value: 'data',
      isLeaf: !bodyChildren,
      children: bodyChildren,
    },
    {
      label: t('Request headers'),
      value: 'headers',
      isLeaf: true,
    },
    {
      label: t('Request query'),
      value: 'query',
      isLeaf: true,
    },
    {
      label: t('Request method'),
      value: 'method',
      isLeaf: true,
    },
  ];
}

export default class WebhookTriggerV2 extends Trigger {
  title = `{{t("Webhook", { ns: "${COMMON_NAMESPACE}" })}}`;
  description = `{{t("Receive HTTP calls from external systems to trigger workflows. Suitable for data pushes and event notifications from third-party systems, such as payment callbacks and message notifications.", { ns: "${COMMON_NAMESPACE}" })}}`;

  FieldsetLoader: LoaderOf = () =>
    import('./WebhookTrigger').then((module) => ({ default: module.WebhookTriggerConfig }));
  TriggerFieldsetLoader: LoaderOf = () =>
    import('./WebhookTrigger').then((module) => ({ default: module.TriggerDataConfig }));

  createDefaultConfig() {
    return { methods: ['POST'] };
  }

  validate(config: Record<string, unknown>) {
    const methods = config?.methods as string[] | undefined;
    if (!methods?.length) {
      return false;
    }
    return methods.every((m) => (HTTP_METHODS as readonly string[]).includes(m));
  }

  useVariables = useVariables;
}
