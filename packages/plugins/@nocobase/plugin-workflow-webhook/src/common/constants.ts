/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export const NAMESPACE = '@nocobase/plugin-workflow-webhook';

export const EVENT_TYPE = 'webhook';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;

export const HTTP_METHOD_OPTIONS = HTTP_METHODS.map((method) => ({
  label: method,
  value: method,
}));
