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

// The primary audit log viewer is built on the v2 client runtime
// (@nocobase/client-v2); see src/client-v2/. This v1 entry registers a
// read-only viewer in the legacy settings UI so the feature is reachable from
// the v1 client too. Both runtimes share the same read-only `auditTrails`
// resource gated by `pm.audit-logger.logs`.
export { default } from './plugin';
