/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useFlowEngine } from '@nocobase/flow-engine';
import { useCallback } from 'react';

const NS = ['@nocobase/plugin-ai', 'client'];

/**
 * v2-runtime translation hook for the AI employee markdown knowledge admin
 * surface. Uses the shared flow-engine i18n instance (same mechanism as
 * plugin-acl's `useT`), scoped to this plugin's namespace with a fallback to
 * the shared `client` namespace.
 */
export const useT = () => {
  const engine = useFlowEngine();
  return useCallback(
    (key: string, options?: Record<string, unknown>) => engine.context.t(key, { ns: NS, ...options }),
    [engine],
  );
};
