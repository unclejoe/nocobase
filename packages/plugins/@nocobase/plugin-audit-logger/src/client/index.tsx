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

// The audit log UI is built on the v2 client runtime (@nocobase/client-v2);
// see src/client-v2/. This v1 entry is a no-op stub that exists only so the
// legacy v1 client loader (which resolves every enabled plugin's `client`
// entry from /static/plugins/<name>/dist/client/index.js) does not 404 and
// abort app boot. The real feature surface lives entirely in client-v2.
export { default } from './plugin';
