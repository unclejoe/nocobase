/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Trigger, WorkflowVariableJSON } from '@nocobase/plugin-workflow/client';
import { NAMESPACE, HTTP_METHODS, HTTP_METHOD_OPTIONS } from '../common/constants';
import { lang } from './locale';
import { WebhookUrlDisplay } from './WebhookUrlDisplay';

function useVariables(config, options) {
  return [
    {
      label: lang('Trigger data'),
      value: 'data',
    },
    {
      label: lang('Request headers'),
      value: 'headers',
    },
    {
      label: lang('Request query'),
      value: 'query',
    },
    {
      label: lang('Request method'),
      value: 'method',
    },
  ];
}

export default class extends Trigger {
  title = `{{t("Webhook", { ns: "${NAMESPACE}" })}}`;
  description = `{{t("Receive HTTP calls from external systems to trigger workflows. Suitable for data pushes and event notifications from third-party systems, such as payment callbacks and message notifications.", { ns: "${NAMESPACE}" })}}`;

  fieldset = {
    url: {
      type: 'void',
      title: `{{t("Webhook URL", { ns: "${NAMESPACE}" })}}`,
      'x-decorator': 'FormItem',
      'x-component': 'WebhookUrlDisplay',
    },
    methods: {
      type: 'array',
      title: `{{t("Request methods", { ns: "${NAMESPACE}" })}}`,
      description: `{{t("Allowed HTTP methods for this webhook endpoint", { ns: "${NAMESPACE}" })}}`,
      'x-decorator': 'FormItem',
      'x-component': 'Checkbox.Group',
      'x-component-props': {
        options: HTTP_METHOD_OPTIONS,
      },
      default: ['POST'],
      required: true,
    },
    secret: {
      type: 'string',
      title: `{{t("Secret", { ns: "${NAMESPACE}" })}}`,
      description: `{{t("Optional secret for request verification. Clients must send it in the x-webhook-secret header.", { ns: "${NAMESPACE}" })}}`,
      'x-decorator': 'FormItem',
      'x-component': 'Input.Password',
    },
  };

  triggerFieldset = {
    data: {
      type: 'object',
      title: `{{t("Trigger data", { ns: "${NAMESPACE}" })}}`,
      description: `{{t("Use JSON as trigger data for testing.", { ns: "${NAMESPACE}" })}}`,
      'x-decorator': 'FormItem',
      'x-component': 'WorkflowVariableJSON',
      default: null,
    },
  };

  validate(values) {
    if (!values.methods?.length) {
      return false;
    }
    return values.methods.every((m) => HTTP_METHODS.includes(m));
  }

  useVariables = useVariables;

  components = {
    WebhookUrlDisplay,
    WorkflowVariableJSON,
  };
}
