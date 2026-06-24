/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { Typography } from 'antd';
import { useFlowContext } from '@nocobase/plugin-workflow/client';
import { lang } from './locale';

const { Text, Paragraph } = Typography;

export function WebhookUrlDisplay() {
  const { workflow } = useFlowContext() ?? {};
  const workflowKey = workflow?.key;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // Keep in sync with the server route in WebhookTrigger.ts: the webhook resource is
  // registered via `resourceManager.define({ name: 'webhooks', actions: { trigger } })`,
  // which NocoBase serves at `/api/webhooks:trigger`. The workflow key is passed as a
  // path segment and mapped to `ctx.action.params.filterByTk` by the resourcemanager.
  const url = workflowKey ? `${origin}/api/webhooks:trigger/${workflowKey}` : '';

  if (!url) {
    return null;
  }

  return (
    <div>
      <Text code copyable style={{ display: 'block', padding: '8px 12px', wordBreak: 'break-all' }}>
        {url}
      </Text>
      <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>
        {lang('Send HTTP requests to this URL to trigger the workflow')}
      </Paragraph>
    </div>
  );
}
