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
 * Copyright (c) 2020-2024 NocoBase Co, Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client';

// No-op v1 plugin. The audit log viewer is implemented entirely in the v2
// client runtime (src/client-v2). This stub only satisfies the v1 loader so
// app boot does not abort on a missing `client` entry.
export class PluginAuditLoggerClient extends Plugin {
  async load() {
    // intentionally empty — feature lives in client-v2
  }
}

export default PluginAuditLoggerClient;
